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
    const signals = curator.memory.highSignals.slice(-limit).reverse();
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
