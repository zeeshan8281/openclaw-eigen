const { runNewsCycle } = require('./news-cycle');
const express = require('express');
const { getAttestation } = require('./services/tee-attestation');
require('dotenv').config();

// Configuration
const INTERVAL_MS = parseInt(process.env.CRON_INTERVAL, 10) || 4 * 60 * 60 * 1000;
const API_PORT = parseInt(process.env.PORT, 10) || 3001;
const API_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;

// ─────────────────────────────────────────────────
// Curator
// ─────────────────────────────────────────────────
const Curator = require('./curator');
const curator = new Curator();

// ─────────────────────────────────────────────────
// Express API (accessed by OpenClaw via curl)
// ─────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Simple token auth middleware
function authMiddleware(req, res, next) {
    if (!API_TOKEN) return next(); // No token configured = open access
    // Skip auth for localhost — curator API is container-internal only
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (token !== API_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// Health check (no auth)
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        uptime: process.uptime(),
        feeds: curator.memory.seenHashes.length,
        signals: curator.memory.highSignals.length,
        attestation: getAttestation()
    });
});

// Get high-signal items
app.get('/api/signals', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const minScore = parseInt(req.query.minScore) || 0;
    const signals = curator.memory.highSignals
        .filter(s => s.score >= minScore)
        .sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    res.json({ count: signals.length, signals, attestation: getAttestation() });
});

// Get latest news briefing
app.get('/api/briefing', authMiddleware, async (req, res) => {
    try {
        const result = await runNewsCycle({ storeOnDA: false });
        res.json({
            briefing: result.briefing,
            articleCount: result.articleCount,
            proof: result.proof || null,
            attestation: getAttestation()
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
        interval: `${INTERVAL_MS / 1000 / 60} min`,
        attestation: getAttestation()
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

// Debug: test scoring a single headline
app.get('/api/test-score', authMiddleware, async (req, res) => {
    const headline = req.query.headline || 'Bitcoin falls to $68,000 as crypto market drowns in red';
    try {
        const { OpenRouterService } = require('./services/openrouter');
        const openrouter = new OpenRouterService();
        const prompt = `Rate this news headline from 1-10 based on significance and novelty. Topics: crypto, blockchain, AI, technology, business, macro economics. 1=routine/spam, 5=mildly interesting, 8=important development, 10=critical breaking event. Reply with ONLY the number.\n\n"${headline}"`;
        const result = await openrouter.chatCompletion("You are a senior news editor at a tech and crypto intelligence service. Reply with only a single number from 1 to 10.", prompt, 50);
        const cleaned = result.content.trim().replace(/[^0-9]/g, '');
        const score = parseInt(cleaned);
        res.json({ headline, raw: result.content, cleaned, score, isNaN: isNaN(score) });
    } catch (err) {
        res.json({ headline, error: err.message });
    }
});

// Reset curator memory (clear seen hashes, keep signals)
app.post('/api/reset', authMiddleware, (req, res) => {
    const keepSignals = req.query.keepSignals !== 'false';
    const oldSeen = curator.memory.seenHashes.length;
    const oldSignals = curator.memory.highSignals.length;
    curator.memory.seenHashes = [];
    if (!keepSignals) curator.memory.highSignals = [];
    curator.saveMemory();
    res.json({
        ok: true,
        cleared: { seenHashes: oldSeen, signals: keepSignals ? 0 : oldSignals },
        message: 'Memory reset. Next curation cycle will re-score all items.'
    });
});

function startAPI() {
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`[API] Listening on port ${API_PORT}`);
    });
}

// ─────────────────────────────────────────────────
// Background Loop
// ─────────────────────────────────────────────────
async function startCuratorService() {
    console.log('--- CURATOR SERVICE STARTUP ---');
    console.log(`API: port ${API_PORT}`);
    console.log(`INTERVAL: ${INTERVAL_MS / 1000 / 60} min`);
    console.log('-------------------------------');

    // Start Express API
    startAPI();

    // Run initial curation cycle immediately on startup
    console.log(`[${new Date().toISOString()}] Running initial curator cycle...`);
    try {
        await curator.runCycle();
    } catch (err) {
        console.error('Initial curator cycle failed:', err.message);
    }

    // Background curator loop
    while (true) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));

        console.log(`\n[${new Date().toISOString()}] Running background curator cycle...`);
        try {
            await curator.runCycle();
        } catch (err) {
            console.error('Curator cycle failed:', err.message);
        }
    }
}

startCuratorService().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
