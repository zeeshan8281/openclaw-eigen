/**
 * News Cron Runner
 * 
 * Standalone script that runs the news cycle and delivers
 * the briefing to Telegram. Designed to be called by cron
 * or OpenClaw's scheduled tasks.
 * 
 * Usage: node src/news-cron.js [chat_id]
 * 
 * If TELEGRAM_CHAT_ID is set (env or arg), delivers directly to Telegram.
 * Otherwise, just prints to stdout (for OpenClaw skill consumption).
 */

const { runNewsCycle } = require('./news-cycle');
const axios = require('axios');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.argv[2] || process.env.TELEGRAM_CHAT_ID || '';

async function sendToTelegram(text) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('[Cron] No TELEGRAM_BOT_TOKEN or CHAT_ID — skipping Telegram delivery');
        return false;
    }

    // Telegram max message length is 4096
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.substring(0, 4000));
        remaining = remaining.substring(4000);
    }

    for (const chunk of chunks) {
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: chunk,
                disable_web_page_preview: true
            });
        } catch (err) {
            console.error(`[Cron] Telegram send failed: ${err.message}`);
            return false;
        }
    }

    console.log(`[Cron] Delivered to Telegram chat ${CHAT_ID}`);
    return true;
}

async function main() {
    console.log(`[Cron] ${new Date().toISOString()} — Starting news cycle`);

    const result = await runNewsCycle({ storeOnDA: true });

    // Add proof info to briefing if available
    let fullText = result.briefing;
    if (result.proof?.commitment) {
        fullText += `\n\nVerified on EigenDA: ${result.proof.commitment.substring(0, 20)}...`;
    }
    if (result.proof?.hash) {
        fullText += `\nContent hash: ${result.proof.hash.substring(0, 16)}...`;
    }

    // Try to deliver to Telegram
    const sent = await sendToTelegram(fullText);
    if (!sent) {
        // Print to stdout for OpenClaw to pick up
        console.log('\n--- BRIEFING ---');
        console.log(fullText);
    }

    console.log(`[Cron] Done. ${result.articleCount} articles processed.`);
}

main().catch(err => {
    console.error(`[Cron] Fatal error: ${err.message}`);
    process.exit(1);
});
