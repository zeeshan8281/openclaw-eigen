/**
 * News Scheduler + Telegram Bot
 * 
 * - Listens for /start, /news commands on Telegram
 * - Auto-discovers chat ID from first interaction
 * - Runs the news cycle every 4 hours and delivers to Telegram
 * - Designed to run alongside OpenClaw in the container
 */

const TelegramBot = require('node-telegram-bot-api');
const { runNewsCycle } = require('./news-cycle');
require('dotenv').config();

const INTERVAL_HOURS = parseInt(process.env.NEWS_INTERVAL_HOURS || '4', 10);
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN) {
    console.error('[Scheduler] TELEGRAM_BOT_TOKEN not set — exiting');
    process.exit(1);
}

// Track all known chat IDs (from env + auto-discovered)
const chatIds = new Set();
if (CHAT_ID) chatIds.add(CHAT_ID);

// Create bot in polling mode
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log(`[Scheduler] Bot started — will deliver news every ${INTERVAL_HOURS}h`);
if (chatIds.size > 0) {
    console.log(`[Scheduler] Pre-configured chat ID: ${CHAT_ID}`);
} else {
    console.log('[Scheduler] No TELEGRAM_CHAT_ID — will auto-discover from /start');
}

// --- Command handlers ---

bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id.toString();
    chatIds.add(id);
    console.log(`[Scheduler] Chat registered: ${id}`);
    bot.sendMessage(msg.chat.id,
        `News bot active. You'll receive briefings every ${INTERVAL_HOURS} hours.\n\nCommands:\n/news — Get latest briefing now\n/status — Check bot status`
    );
});

bot.onText(/\/news/, async (msg) => {
    const id = msg.chat.id.toString();
    chatIds.add(id);
    bot.sendMessage(msg.chat.id, 'Fetching latest news...');

    try {
        const result = await runNewsCycle({ storeOnDA: true });
        let text = result.briefing;
        if (result.proof?.commitment) {
            text += `\n\nEigenDA: ${result.proof.commitment.substring(0, 30)}...`;
        }
        await sendToChat(msg.chat.id, text);
    } catch (err) {
        bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
});

bot.onText(/\/status/, (msg) => {
    const id = msg.chat.id.toString();
    chatIds.add(id);
    bot.sendMessage(msg.chat.id,
        `Status: Running\nInterval: ${INTERVAL_HOURS}h\nRegistered chats: ${chatIds.size}\nEigenDA: ${process.env.EIGENDA_PROXY_URL || 'not configured'}`
    );
});

// --- Delivery ---

async function sendToChat(chatId, text) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.substring(0, 4000));
        remaining = remaining.substring(4000);
    }
    for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { disable_web_page_preview: true });
    }
}

async function deliverToAll(text) {
    if (chatIds.size === 0) {
        console.log('[Scheduler] No registered chats — skipping delivery');
        return;
    }
    for (const id of chatIds) {
        try {
            await sendToChat(id, text);
            console.log(`[Scheduler] Delivered to chat ${id}`);
        } catch (err) {
            console.error(`[Scheduler] Failed to deliver to ${id}: ${err.message}`);
        }
    }
}

async function tick() {
    const now = new Date().toISOString();
    console.log(`[Scheduler] ${now} — Running news cycle`);

    try {
        const result = await runNewsCycle({ storeOnDA: true });

        let text = result.briefing;
        if (result.proof?.commitment) {
            text += `\n\nEigenDA: ${result.proof.commitment.substring(0, 30)}...`;
        }

        await deliverToAll(text);
        console.log(`[Scheduler] Cycle complete — ${result.articleCount} articles`);
    } catch (err) {
        console.error(`[Scheduler] Cycle failed: ${err.message}`);
    }
}

// Run immediately on start, then every INTERVAL_HOURS
setTimeout(() => {
    tick();
    setInterval(tick, INTERVAL_MS);
}, 10000);
