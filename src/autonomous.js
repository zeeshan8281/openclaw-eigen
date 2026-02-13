const { runPipeline } = require('./pipeline');
const { runNewsCycle } = require('./news-cycle');
const { EigenAIService } = require('./services/eigenai');
const { OpenRouterService } = require('./services/openrouter');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

// Configuration
const PUBLISH_URL = process.env.PUBLISH_URL || 'https://autonomous-website.vercel.app/api/publish';
const INTERVAL_MS = parseInt(process.env.CRON_INTERVAL, 10) || 4 * 60 * 60 * 1000; // Default 4h
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Service Initialization
const eigenai = new EigenAIService();
const openrouter = new OpenRouterService();

// Determine primary LLM
const USE_OPENROUTER = !!process.env.OPENROUTER_API_KEY;
const LLM_MODEL = USE_OPENROUTER ? openrouter.model : 'eigenai-120b';
const LLM_NAME = USE_OPENROUTER ? `OpenRouter (${LLM_MODEL})` : 'EigenAI (120B)';

console.log(`[Autonomous] Using Primary LLM: ${LLM_NAME}`);

const TOPICS = [
    "The implications of EIP-4844 on Ethereum L2 fees",
    "Understanding the role of EigenDA in Data Availability",
    "ZK-SNARK vs ZK-STARK: A privacy comparison",
    "The future of decentralized sequencers",
    "Restaking risks: Slashing conditions explained",
    "Optimistic Rollups: Fraud proof lifecycle analysis"
];

const SYSTEM_PROMPT = `You are Alfred, a helpful crypto & tech assistant on Telegram. 
You are powered by ${LLM_NAME} inside a secure EigenCompute TEE.

STRICT OPERATIONAL RULES:
1. ONLY output the direct response to the user. 
2. NEVER explain what you are doing. 
3. NEVER narrate your internal reasoning.
4. NEVER use meta-talk like "The user said" or "We should respond with". 
5. NO Markdown tables. Use bold text and bullet points only.
6. Keep it conversational, friendly, and concise.`;

// Per-chat conversation history for LLM
const history = new Map();
const MAX_HISTORY = 10;

function getHistory(chatId) {
    if (!history.has(chatId)) history.set(chatId, []);
    return history.get(chatId);
}

// ─────────────────────────────────────────────────
// LLM Chat Logic
// ─────────────────────────────────────────────────
async function askLLM(chatId, userMessage) {
    const msgs = getHistory(chatId);

    // Better structure to avoid "Narrator" mode
    const historyBlock = msgs.length > 0
        ? `[CONVERSATION HISTORY]\n${msgs.map(m => `${m.role === 'user' ? 'User' : 'Alfred'}: ${m.content}`).join('\n')}\n`
        : '';

    const fullUserPrompt = `${historyBlock}\n[CURRENT TASK]\nUser: ${userMessage}\n\nAlfred (Response only):`;

    try {
        let result;
        if (USE_OPENROUTER) {
            result = await openrouter.chatCompletion(SYSTEM_PROMPT, fullUserPrompt, 1000);
        } else {
            result = await eigenai.chatCompletion(SYSTEM_PROMPT, fullUserPrompt, 1000);
        }

        // CLEANUP: Strip base-model tags and meta-talk
        let reply = result.content
            .replace(/<\|.*?\|>/g, '') // Strip hidden model tags
            .replace(/(The user (said|gave|says)|Probably a greeting|So we respond|We need to respond|User says|analysis|User asks).*?(\*\*|Alfred:)/gis, '') // Strip meta-talk
            .replace(/Alfred: /g, '') // Strip self-labeling
            .trim();

        // One last safety check
        if (reply.includes("Alfred:")) reply = reply.split("Alfred:").pop().trim();

        msgs.push({ role: 'user', content: userMessage });
        msgs.push({ role: 'assistant', content: reply });
        if (msgs.length > MAX_HISTORY * 2) msgs.splice(0, 2);
        return reply;
    } catch (err) {
        console.error(`[LLM] Error: ${err.message}`);
        return `I'm having a brief connection issue with EigenAI. (${err.message})`;
    }
}

// ─────────────────────────────────────────────────
// Telegram Delivery Helpers
// ─────────────────────────────────────────────────
let bot = null;
if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true }); // Polling ENABLED for interactivity
        console.log('[Telegram] ✅ Bot initialized with Polling');
    } catch (e) {
        console.error('[Telegram] ❌ Initialization failed:', e.message);
    }
}

async function sendToTelegram(chatId, text) {
    if (!bot || !chatId) return;
    try {
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
            await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) {
        console.error('[Telegram] ❌ Send failed:', e.message);
    }
}

// ─────────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────────
const Curator = require('./curator');
const curator = new Curator();

// ─────────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────────
if (bot) {
    bot.onText(/\/start/, (msg) => {
        bot.sendMessage(msg.chat.id,
            "👋 Hey! I'm Alfred, your TEE-secured crypto assistant.\n\n" +
            "I'm currently running in an EigenCompute TEE node.\n\n" +
            "Commands:\n" +
            "/news — Get an immediate real-time news briefing\n" +
            "/research <topic> — Trigger a deep autonomous research article\n" +
            "/curate — Manually trigger a curation cycle (RSS -> Score)\n" +
            "/signals — View high-signal items found by the Curator\n" +
            "/help — Show this message"
        );
    });

    bot.onText(/\/curate/, async (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "🕵️ Starting manual curation cycle...");
        try {
            await curator.runCycle();
            const stats = curator.getDetails();
            bot.sendMessage(chatId, `✅ Cycle complete.\n\n${stats}`);
        } catch (err) {
            bot.sendMessage(chatId, `❌ Curation failed: ${err.message}`);
        }
    });

    bot.onText(/\/signals/, async (msg) => {
        const chatId = msg.chat.id;
        const signals = curator.memory.highSignals; // Access direct safe memory
        if (signals.length === 0) {
            bot.sendMessage(chatId, "📭 No high-signal items found yet.");
        } else {
            const text = signals.slice(-5).map(s => `🔥 *${s.score}/10*: [${s.title}](${s.link})`).join('\n\n');
            bot.sendMessage(chatId, `🧠 *Active High-Signal Items:*\n\n${text}`, { parse_mode: 'Markdown' });
        }
    });

    bot.onText(/\/news/, async (msg) => {
        const chatId = msg.chat.id;
        bot.sendChatAction(chatId, 'typing');
        bot.sendMessage(chatId, "🔎 Gathering latest news from RSS and HackerNews...");

        try {
            const result = await runNewsCycle({ storeOnDA: true });
            let text = `📰 *Latest Crypto & Tech Briefing*\n\n${result.briefing}`;
            if (result.proof?.commitment) {
                text += `\n\n🔗 *EigenDA Proof:* https://blobs-sepolia.eigenda.xyz/blobs/${result.proof.commitment}`;
            }
            await sendToTelegram(chatId, text);
        } catch (err) {
            bot.sendMessage(chatId, `❌ News cycle failed: ${err.message}`);
        }
    });

    bot.onText(/\/research (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const topic = match[1];
        bot.sendMessage(chatId, `🚀 Starting deep research on: "${topic}"\nThis takes ~1-2 minutes...`);

        try {
            const result = await runPipeline(topic);
            let text = `📄 *Deep Research Complete: ${topic}*\n\n${result.finalContent.substring(0, 1500)}...`;
            if (result.commitment) {
                text += `\n\n🔗 *Verifiable Proof (EigenDA):* https://blobs-sepolia.eigenda.xyz/blobs/${result.commitment}`;
            }
            await sendToTelegram(chatId, text);
        } catch (err) {
            bot.sendMessage(chatId, `❌ Research failed: ${err.message}`);
        }
    });

    // Handle normal chat messages
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const chatId = msg.chat.id;
        bot.sendChatAction(chatId, 'typing');
        const reply = await askLLM(chatId, msg.text);
        bot.sendMessage(chatId, reply);
    });
}

// ─────────────────────────────────────────────────
// Background Autonomous Loop
// ─────────────────────────────────────────────────
async function startAutonomousAgent() {
    console.log('--- STARTUP DIAGNOSTICS ---');
    console.log(`WALLET: ${process.env.WALLET_ADDRESS}`);
    console.log(`TELEGRAM: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
    console.log(`POLLING: Enabled`);
    console.log('--- END DIAGNOSTICS ---');

    // Startup Delay
    await new Promise(r => setTimeout(r, 2000));

    while (true) {
        // 1. Run The Curator (High Frequency Signal Check)
        console.log(`\n[${new Date().toISOString()}] 🕵️ Running Curator Cycle...`);
        try {
            await curator.runCycle();
        } catch (err) {
            console.error('⚠️ Curator cycle failed (Non-fatal):', err.message);
        }

        // 2. Run Deep Research (Low Frequency)
        // Only run deep research every 4th cycle or so, but for now we run it every time
        const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        console.log(`\n[${new Date().toISOString()}] 🤖 Deep Cycle Start: "${topic}"`);

        try {
            const result = await runPipeline(topic);

            // Deliver to default chat if configured
            if (CHAT_ID) {
                let text = `🤖 *Autonomous Briefing: ${topic}*\n\n${result.finalContent.substring(0, 1000)}...`;
                if (result.commitment) {
                    text += `\n\n🔗 *EigenDA Proof:* https://blobs-sepolia.eigenda.xyz/blobs/${result.commitment}`;
                }
                const curationStats = curator.getDetails();
                text += `\n\n---\n${curationStats}`;

                await sendToTelegram(CHAT_ID, text);
            }

            console.log('✅ Deep Cycle complete.');
        } catch (err) {
            console.error('❌ Cycle error:', err.message);
        }

        console.log(`[Cycle] Sleeping for ${INTERVAL_MS / 1000 / 60} minutes...`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}

startAutonomousAgent().catch(err => {
    console.error('Fatal agent error:', err);
    process.exit(1);
});

