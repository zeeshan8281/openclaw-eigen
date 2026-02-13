const { runPipeline } = require('./pipeline');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

// Configuration
const PUBLISH_URL = process.env.PUBLISH_URL || 'https://autonomous-website.vercel.app/api/publish';
const INTERVAL_MS = parseInt(process.env.CRON_INTERVAL, 10) || 4 * 60 * 60 * 1000; // Default 4h
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TOPICS = [
    "The implications of EIP-4844 on Ethereum L2 fees",
    "Understanding the role of EigenDA in Data Availability",
    "ZK-SNARK vs ZK-STARK: A privacy comparison",
    "The future of decentralized sequencers",
    "Restaking risks: Slashing conditions explained",
    "Optimistic Rollups: Fraud proof lifecycle analysis"
];

// Initialize Telegram safely
let bot = null;
if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: false }); // Polling disabled for TEE stability
        console.log('[Telegram] ✅ Bot initialized');
    } catch (e) {
        console.error('[Telegram] ❌ Initialization failed:', e.message);
    }
} else {
    console.warn('[Telegram] ⚠️  No token provided. Skipping Telegram delivery.');
}

async function sendToTelegram(text) {
    if (!bot || !CHAT_ID) return;
    try {
        // Handle long messages
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
            await bot.sendMessage(CHAT_ID, chunk);
        }
        console.log('[Telegram] ✅ Briefing delivered');
    } catch (e) {
        console.error('[Telegram] ❌ Delivery failed:', e.message);
    }
}

async function startAutonomousAgent() {
    // STARTUP DIAGNOSTICS
    console.log('--- ENV DIAGNOSTICS ---');
    console.log(`WALLET_PRIVATE_KEY present: ${!!process.env.WALLET_PRIVATE_KEY}`);
    console.log(`WALLET_ADDRESS present: ${!!process.env.WALLET_ADDRESS}`);
    console.log(`TELEGRAM_BOT_TOKEN present: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
    console.log('--- END DIAGNOSTICS ---');

    console.log('[TEE] Waiting 5s for network stabilization...');
    await new Promise(r => setTimeout(r, 5000));

    // Check critical vars but don't exit immediately to allow log capture
    if (!process.env.WALLET_PRIVATE_KEY || !process.env.WALLET_ADDRESS) {
        console.error('CRITICAL: Missing Wallet Config! Staying alive for 60s for debugging...');
        await new Promise(r => setTimeout(r, 60000));
        throw new Error('Missing Wallet Config');
    }

    while (true) {
        const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        console.log(`\n[${new Date().toISOString()}] 🤖 Waking up for topic: "${topic}"`);

        try {
            // 1. OPENCLAW Pipeline (The "Part" you were looking for)
            // This runs: Research -> Draft -> Verify (EigenAI) -> Store (EigenDA)
            const result = await runPipeline(topic);

            // 2. Telegram Delivery (Restored)
            let telegramText = `🤖 *Autonomous Briefing: ${topic}*\n\n${result.finalContent.substring(0, 1000)}...`;
            if (result.commitment) {
                telegramText += `\n\n🔗 *EigenDA Proof:* https://blobs-sepolia.eigenda.xyz/blobs/${result.commitment}`;
            }
            await sendToTelegram(telegramText);

            // 3. Website Publishing
            try {
                await axios.post(PUBLISH_URL, {
                    title: topic,
                    content: result.finalContent,
                    proof_id: result.commitment,
                    verified: true
                });
                console.log('[Web] ✅ Published to Vercel');
            } catch (e) {
                console.warn('[Web] ⚠️  Publishing failed:', e.message);
            }

            console.log('\n✅ Cycle complete.');
        } catch (err) {
            console.error('\n❌ Cycle failed:', err.message);
        }

        console.log(`[Cycle] Going back to sleep...`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}

startAutonomousAgent().catch(err => {
    console.error('Fatal agent error:', err);
    process.exit(1);
});
