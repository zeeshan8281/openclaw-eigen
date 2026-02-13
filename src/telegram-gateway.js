/**
 * Telegram Gateway — Lightweight OpenClaw replacement for containers
 * 
 * Handles:
 * - Chat messages via EigenAI proxy (OpenAI-compatible)
 * - /news command to trigger news cycle
 * - /start, /help, /clear commands
 * 
 * This is used when openclaw's native modules can't be built in the container.
 */

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { runNewsCycle } = require('./news-cycle');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PROXY_URL = process.env.EIGENAI_PROXY_URL || 'http://127.0.0.1:3002/v1';
const MODEL = 'gpt-oss-120b-f16';

if (!BOT_TOKEN) {
    console.error('[Gateway] TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
}

const SYSTEM_PROMPT = `You are Alfred, a crypto & tech news assistant on Telegram.
You are helpful, concise, and direct. You have deep knowledge of crypto, blockchain, DeFi, AI, and technology.
When users ask for news, you can provide briefings from real sources.
Keep responses short and conversational. Never fabricate headlines or data.
If you don't know something, say so honestly.`;

// Per-chat conversation history
const history = new Map();
const MAX_HISTORY = 10;

function getHistory(chatId) {
    if (!history.has(chatId)) history.set(chatId, []);
    return history.get(chatId);
}

async function askLLM(chatId, userMessage) {
    const msgs = getHistory(chatId);
    msgs.push({ role: 'user', content: userMessage });
    if (msgs.length > MAX_HISTORY) msgs.splice(0, msgs.length - MAX_HISTORY);

    try {
        const res = await axios.post(`${PROXY_URL}/chat/completions`, {
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...msgs
            ],
            max_tokens: 1000,
            temperature: 0.7
        }, { timeout: 120000 });

        const reply = res.data?.choices?.[0]?.message?.content || 'Sorry, I had trouble generating a response.';
        msgs.push({ role: 'assistant', content: reply });
        return reply;
    } catch (err) {
        console.error(`[Gateway] LLM error: ${err.message}`);
        return `Sorry, I'm having trouble right now. (${err.message})`;
    }
}

async function handleNews(chatId, bot) {
    bot.sendChatAction(chatId, 'typing');
    try {
        console.log('[Gateway] Running news cycle...');
        const result = await runNewsCycle({ storeOnDA: true });
        
        let text = result.briefing;
        if (result.proof?.commitment) {
            text += `\n\nVerified on EigenDA: ${result.proof.commitment.substring(0, 20)}...`;
        }
        
        // Split long messages
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            chunks.push(remaining.substring(0, 4000));
            remaining = remaining.substring(4000);
        }
        
        for (const chunk of chunks) {
            await bot.sendMessage(chatId, chunk, { disable_web_page_preview: true });
        }
        
        // Store chat ID for scheduled delivery
        if (!process.env.TELEGRAM_CHAT_ID) {
            process.env.TELEGRAM_CHAT_ID = String(chatId);
            console.log(`[Gateway] Set TELEGRAM_CHAT_ID to ${chatId} for scheduled delivery`);
        }
    } catch (err) {
        console.error(`[Gateway] News cycle error: ${err.message}`);
        bot.sendMessage(chatId, `News cycle failed: ${err.message}`);
    }
}

// --- Start bot ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => {
    if (err.message?.includes('409')) {
        console.error('[Gateway] 409 conflict — another bot instance is running. Retrying in 10s...');
        setTimeout(() => process.exit(1), 10000); // Restart to retry
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        "Hey! I'm Alfred, your crypto & tech news assistant.\n\n" +
        "Commands:\n" +
        "/news — Get the latest news briefing\n" +
        "/clear — Clear conversation history\n" +
        "/help — Show this message\n\n" +
        "Or just chat with me about anything!"
    );
    // Auto-register chat for scheduled delivery
    if (!process.env.TELEGRAM_CHAT_ID) {
        process.env.TELEGRAM_CHAT_ID = String(msg.chat.id);
    }
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "I'm Alfred — powered by EigenAI (120B model) running in an EigenCompute TEE.\n\n" +
        "/news — Latest crypto & tech news briefing\n" +
        "/clear — Reset our conversation\n" +
        "\nI also send a news briefing every 4 hours automatically!"
    );
});

bot.onText(/\/clear/, (msg) => {
    history.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, "Conversation cleared. Fresh start!");
});

bot.onText(/\/news/, (msg) => {
    handleNews(msg.chat.id, bot);
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    console.log(`[Gateway] ${msg.from?.first_name}: ${msg.text.substring(0, 80)}`);

    // Auto-register chat
    if (!process.env.TELEGRAM_CHAT_ID) {
        process.env.TELEGRAM_CHAT_ID = String(chatId);
    }

    bot.sendChatAction(chatId, 'typing');
    const reply = await askLLM(chatId, msg.text);
    console.log(`[Gateway] → ${reply.substring(0, 80)}...`);
    bot.sendMessage(chatId, reply);
});

console.log('[Gateway] Telegram bot started. Waiting for messages...');
console.log(`[Gateway] LLM: ${PROXY_URL} | Model: ${MODEL}`);
