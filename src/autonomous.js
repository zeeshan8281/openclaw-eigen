const { runNewsCycle } = require('./news-cycle');
const { EigenAIService } = require('./services/eigenai');
const { OpenRouterService } = require('./services/openrouter');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

// Configuration
const INTERVAL_MS = parseInt(process.env.CRON_INTERVAL, 10) || 4 * 60 * 60 * 1000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_PORT = parseInt(process.env.PORT, 10) || 3001;
const API_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;
let CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

// Service Initialization
const eigenai = new EigenAIService();
const openrouter = new OpenRouterService();

const USE_OPENROUTER = !!process.env.OPENROUTER_API_KEY;
const LLM_MODEL = USE_OPENROUTER ? openrouter.model : 'eigenai-120b';
const LLM_NAME = USE_OPENROUTER ? `OpenRouter (${LLM_MODEL})` : 'EigenAI (120B)';

console.log(`[Autonomous] LLM: ${LLM_NAME}`);

const SYSTEM_PROMPT = `You are Alfred, a helpful crypto & tech assistant on Telegram.
You are powered by ${LLM_NAME} inside a secure EigenCompute TEE.

STRICT OPERATIONAL RULES:
1. ONLY output the direct response to the user.
2. NEVER explain what you are doing.
3. NEVER narrate your internal reasoning.
4. NEVER use meta-talk like "The user said" or "We should respond with".
5. NO Markdown tables. Use bold text and bullet points only.
6. Keep it conversational, friendly, and concise.`;

// Per-chat conversation history
const history = new Map();
const MAX_HISTORY = 10;

function getHistory(chatId) {
    if (!history.has(chatId)) history.set(chatId, []);
    return history.get(chatId);
}

// ─────────────────────────────────────────────────
// LLM Chat
// ─────────────────────────────────────────────────
async function askLLM(chatId, userMessage) {
    const msgs = getHistory(chatId);

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

        let reply = result.content
            .replace(/<\|.*?\|>/g, '')
            .replace(/(The user (said|gave|says)|Probably a greeting|So we respond|We need to respond|User says|analysis|User asks).*?(\*\*|Alfred:)/gis, '')
            .replace(/Alfred: /g, '')
            .trim();

        if (reply.includes("Alfred:")) reply = reply.split("Alfred:").pop().trim();

        msgs.push({ role: 'user', content: userMessage });
        msgs.push({ role: 'assistant', content: reply });
        if (msgs.length > MAX_HISTORY * 2) msgs.splice(0, 2);
        return reply;
    } catch (err) {
        console.error(`[LLM] Error: ${err.message}`);
        return `Sorry, I'm having a connection issue right now. Try again in a moment.`;
    }
}

// ─────────────────────────────────────────────────
// Telegram Setup
// ─────────────────────────────────────────────────
let bot = null;

async function initTelegram() {
    if (!BOT_TOKEN) {
        console.warn('[Telegram] No BOT_TOKEN — skipping');
        return;
    }

    // Clear any stale webhook/polling before starting
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
            drop_pending_updates: true
        });
        console.log('[Telegram] Cleared stale webhook/updates');
    } catch (e) {
        console.warn('[Telegram] Could not clear webhook:', e.message);
    }

    // Small delay to let Telegram release the polling lock
    await new Promise(r => setTimeout(r, 2000));

    bot = new TelegramBot(BOT_TOKEN, {
        polling: {
            interval: 1000,
            autoStart: true,
            params: { timeout: 30 }
        }
    });

    bot.on('polling_error', (err) => {
        if (err.code === 'ETELEGRAM' && err.message.includes('409')) {
            console.error('[Telegram] 409 Conflict — another instance is running. Will retry...');
        } else {
            console.error('[Telegram] Polling error:', err.code, err.message);
        }
    });

    console.log('[Telegram] Bot started with polling');
    setupCommands();
}

// ─────────────────────────────────────────────────
// Send helper
// ─────────────────────────────────────────────────
async function sendToTelegram(chatId, text) {
    if (!bot || !chatId) return;
    try {
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
            await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) {
        // Markdown can fail on special chars — retry without parse_mode
        try {
            const chunks = text.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk);
            }
        } catch (e2) {
            console.error('[Telegram] Send failed:', e2.message);
        }
    }
}

// ─────────────────────────────────────────────────
// Curator
// ─────────────────────────────────────────────────
const Curator = require('./curator');
const curator = new Curator();

// ─────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────
function setupCommands() {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        // Auto-save chat ID for background notifications
        if (!CHAT_ID) {
            CHAT_ID = String(chatId);
            console.log(`[Telegram] Auto-detected CHAT_ID: ${CHAT_ID}`);
        }
        bot.sendMessage(chatId,
            "Hey! I'm Alfred, your TEE-secured crypto assistant.\n\n" +
            "Commands:\n" +
            "/news - Real-time news briefing\n" +
            "/curate - Trigger RSS curation cycle\n" +
            "/signals - View high-signal items\n" +
            "/whoami - Show your chat ID\n" +
            "/help - Show this message\n\n" +
            "Or just chat with me!"
        );
    });

    bot.onText(/\/help/, (msg) => {
        bot.sendMessage(msg.chat.id,
            "Commands:\n" +
            "/news - Real-time news briefing\n" +
            "/curate - Trigger RSS curation cycle\n" +
            "/signals - View high-signal items\n" +
            "/whoami - Show your chat ID\n" +
            "/help - Show this message\n\n" +
            "Or just send me any message to chat!"
        );
    });

    bot.onText(/\/whoami/, (msg) => {
        bot.sendMessage(msg.chat.id, `Your chat ID: ${msg.chat.id}`);
    });

    bot.onText(/\/curate/, async (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "Starting curation cycle...");
        try {
            await curator.runCycle();
            const stats = curator.getDetails();
            bot.sendMessage(chatId, `Done!\n\n${stats}`);
        } catch (err) {
            bot.sendMessage(chatId, `Curation failed: ${err.message}`);
        }
    });

    bot.onText(/\/signals/, (msg) => {
        const chatId = msg.chat.id;
        const signals = curator.memory.highSignals;
        if (signals.length === 0) {
            bot.sendMessage(chatId, "No high-signal items found yet. Run /curate first.");
        } else {
            const text = signals.slice(-5).map(s => `[${s.score}/10] ${s.title}\n${s.link}`).join('\n\n');
            bot.sendMessage(chatId, `High-Signal Items:\n\n${text}`);
        }
    });

    bot.onText(/\/news/, async (msg) => {
        const chatId = msg.chat.id;
        bot.sendChatAction(chatId, 'typing');
        bot.sendMessage(chatId, "Gathering latest news...");

        try {
            const result = await runNewsCycle({ storeOnDA: false });
            let text = `Latest Briefing:\n\n${result.briefing}`;
            if (result.proof?.commitment) {
                text += `\n\nEigenDA Proof: https://blobs-sepolia.eigenda.xyz/blobs/${result.proof.commitment}`;
            }
            await sendToTelegram(chatId, text);
        } catch (err) {
            bot.sendMessage(chatId, `News cycle failed: ${err.message}`);
        }
    });

    // Free chat — any non-command message
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const chatId = msg.chat.id;
        bot.sendChatAction(chatId, 'typing');
        const reply = await askLLM(chatId, msg.text);
        await sendToTelegram(chatId, reply);
    });
}

// ─────────────────────────────────────────────────
// Express API (A2A + Human access)
// ─────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Simple token auth middleware
function authMiddleware(req, res, next) {
    if (!API_TOKEN) return next(); // No token configured = open access
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (token !== API_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// Health check (no auth)
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        uptime: process.uptime(),
        telegram: !!bot,
        feeds: curator.memory.seenHashes.length,
        signals: curator.memory.highSignals.length
    });
});

// Get high-signal items
app.get('/api/signals', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const signals = curator.memory.highSignals.slice(-limit).reverse();
    res.json({ count: signals.length, signals });
});

// Get latest news briefing
app.get('/api/briefing', authMiddleware, async (req, res) => {
    try {
        const result = await runNewsCycle({ storeOnDA: false });
        res.json({
            briefing: result.briefing,
            articleCount: result.articleCount,
            proof: result.proof || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get curator stats
app.get('/api/stats', authMiddleware, (req, res) => {
    res.json({
        feeds: curator.memory.seenHashes ? 6 : 0,
        seenItems: curator.memory.seenHashes.length,
        highSignals: curator.memory.highSignals.length,
        llm: LLM_NAME,
        interval: `${INTERVAL_MS / 1000 / 60} min`
    });
});

// Trigger a curation cycle
app.post('/api/curate', authMiddleware, async (req, res) => {
    try {
        await curator.runCycle();
        res.json({ ok: true, stats: curator.getDetails() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function startAPI() {
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`[API] Listening on port ${API_PORT}`);
    });
}

// ─────────────────────────────────────────────────
// Background Loop
// ─────────────────────────────────────────────────
async function startAutonomousAgent() {
    console.log('--- STARTUP ---');
    console.log(`WALLET: ${process.env.WALLET_ADDRESS || 'not set'}`);
    console.log(`TELEGRAM: ${!!BOT_TOKEN}`);
    console.log(`API: port ${API_PORT}`);
    console.log(`INTERVAL: ${INTERVAL_MS / 1000 / 60} min`);
    console.log('---------------');

    // Start Express API
    startAPI();

    // Start Telegram bot
    await initTelegram();

    // Background curator loop
    while (true) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));

        console.log(`\n[${new Date().toISOString()}] Running background curator cycle...`);
        try {
            await curator.runCycle();
            // Notify if new high signals found and we have a chat
            if (CHAT_ID && curator.memory.highSignals.length > 0) {
                const latest = curator.memory.highSignals.slice(-3);
                const text = `Background scan found signals:\n\n` +
                    latest.map(s => `[${s.score}/10] ${s.title}`).join('\n');
                await sendToTelegram(CHAT_ID, text);
            }
        } catch (err) {
            console.error('Curator cycle failed:', err.message);
        }
    }
}

startAutonomousAgent().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
