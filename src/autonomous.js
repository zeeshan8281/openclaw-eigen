const { runNewsCycle } = require('./news-cycle');
const express = require('express');
const { getAttestation } = require('./services/tee-attestation');
require('dotenv').config();

const PaymentService = require('./services/payments');

// Configuration
const INTERVAL_MS = parseInt(process.env.CRON_INTERVAL, 10) || 4 * 60 * 60 * 1000;
const API_PORT = parseInt(process.env.PORT, 10) || 3001;
const API_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;

// Payment service
const payments = new PaymentService();

// ─────────────────────────────────────────────────
// Curator
// ─────────────────────────────────────────────────
const Curator = require('./curator');
const curator = new Curator();

// ─────────────────────────────────────────────────
// Express API (accessed by OpenClaw via curl)
// ─────────────────────────────────────────────────
const cors = require('cors');
const app = express();
app.use(cors());
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

// Wallet-payment auth middleware (for premium endpoints)
function paidMiddleware(req, res, next) {
    // Localhost bypass (container-internal)
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
    // Legacy token auth still works
    const legacyToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (API_TOKEN && legacyToken === API_TOKEN) return next();
    // Wallet session auth
    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) return res.status(401).json({ error: 'Unauthorized — use token auth or wallet sign-in' });
    const session = payments.getSession(sessionToken);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
    if (!session.paid) return res.status(402).json({ error: 'Payment required', payTo: payments.paymentWallet, amount: payments.minPaymentEth, network: 'Sepolia' });
    req.walletAddress = session.address;
    next();
}

// ── Wallet Auth Routes ──────────────────────────

// Get nonce to sign
app.get('/api/auth/nonce', (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address query param required' });
    try {
        const result = payments.getNonce(address);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Verify signature, get session token
app.post('/api/auth/verify', (req, res) => {
    const { address, signature } = req.body;
    if (!address || !signature) return res.status(400).json({ error: 'address and signature required' });
    try {
        const result = payments.verifySignature(address, signature);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Check payment status / verify tx
app.get('/api/auth/status', async (req, res) => {
    const token = req.headers['x-session-token'];
    if (!token) return res.status(400).json({ error: 'x-session-token header required' });
    try {
        const result = await payments.checkPayment(token, req.query.txHash);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── Telegram Payment Routes (called by Alfred via curl) ──

// Check if a Telegram user has paid
app.get('/api/telegram/payment-status', (req, res) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    res.json(payments.isTelegramPaid(chatId));
});

// Redeem a beta invite code for a Telegram user
app.post('/api/telegram/redeem-code', (req, res) => {
    const { chatId, code } = req.body;
    if (!chatId || !code) return res.status(400).json({ error: 'chatId and code required' });
    const result = payments.redeemBetaCode(chatId, code);
    res.json(result);
});

// Verify a Telegram user's payment by txHash
app.post('/api/telegram/verify-payment', async (req, res) => {
    const { chatId, txHash } = req.body;
    if (!chatId || !txHash) return res.status(400).json({ error: 'chatId and txHash required' });
    try {
        const result = await payments.verifyTelegramPayment(chatId, txHash);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Payment-gated Telegram endpoints (server-enforced, not LLM-enforced)
app.get('/api/telegram/signals', (req, res) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    const status = payments.isTelegramPaid(chatId);
    if (!status.paid) return res.status(402).json({ error: 'Payment required', ...status });
    const limit = parseInt(req.query.limit) || 20;
    const signals = curator.memory.highSignals
        .sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    const attestation = getAttestation();
    res.json({ count: signals.length, signals, attestation });
});

app.get('/api/telegram/briefing', async (req, res) => {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    const status = payments.isTelegramPaid(chatId);
    if (!status.paid) return res.status(402).json({ error: 'Payment required', ...status });
    try {
        const { runNewsCycle } = require('./news-cycle');
        const result = await runNewsCycle({ storeOnDA: false });
        const attestation = getAttestation();
        res.json({ briefing: result.briefing, articleCount: result.articleCount, attestation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── A2A Agent Card ──────────────────────────────

app.get('/.well-known/agent.json', (req, res) => {
    res.json({
        name: 'Alfred',
        description: 'Crypto & tech intelligence curator running in a TEE. Crawls RSS, HackerNews, and Twitter, scores headlines with AI, and surfaces high-signal items.',
        url: `${req.protocol}://${req.get('host')}`,
        version: '2.2.0',
        capabilities: {
            streaming: false,
            pushNotifications: false
        },
        skills: [
            {
                id: 'signals',
                name: 'Get Signals',
                description: 'Returns AI-scored news signals from crypto, tech, and business feeds.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Max items to return', default: 20 },
                        minScore: { type: 'number', description: 'Minimum score filter (1-10)', default: 0 }
                    }
                }
            },
            {
                id: 'briefing',
                name: 'News Briefing',
                description: 'Returns a formatted news briefing summarizing top stories.'
            },
            {
                id: 'stats',
                name: 'Curator Stats',
                description: 'Returns curator statistics (feeds, seen items, signal count).'
            }
        ],
        payment: {
            required: true,
            network: 'sepolia',
            chainId: 11155111,
            token: 'ETH',
            amount: payments.minPaymentEth,
            recipient: payments.paymentWallet,
            description: 'One-time payment to unlock premium signal access. Send ETH, then submit tx hash for on-chain verification.'
        },
        authentication: {
            schemes: ['wallet-signature', 'bearer-token']
        }
    });
});

// ── A2A Task Endpoint ───────────────────────────

app.post('/a2a', express.json(), async (req, res) => {
    const { method, params, id } = req.body || {};

    // JSON-RPC style
    if (method === 'tasks/send') {
        const task = params?.task || params;
        const skill = task?.skill || task?.action;
        const input = task?.input || task?.args || {};

        // Check for session/payment
        const sessionToken = req.headers['x-session-token'];
        const txHash = input.txHash || req.headers['x-tx-hash'];

        // If they provide a txHash but no session, create a quick session from tx
        if (txHash && !sessionToken) {
            try {
                const result = await payments.checkPayment(null, txHash);
                if (result?.paid) {
                    // Tx verified — process the request
                    return await handleA2ASkill(skill, input, id, res);
                }
            } catch {}
        }

        // Check session-based auth
        if (sessionToken) {
            const session = payments.getSession(sessionToken);
            if (session?.paid) {
                return await handleA2ASkill(skill, input, id, res);
            }
        }

        // Allow free skills
        if (skill === 'stats') {
            return await handleA2ASkill(skill, input, id, res);
        }

        // Payment required
        return res.json({
            jsonrpc: '2.0',
            id,
            result: {
                status: 'payment-required',
                payment: {
                    network: 'sepolia',
                    chainId: 11155111,
                    token: 'ETH',
                    amount: payments.minPaymentEth,
                    recipient: payments.paymentWallet,
                    instructions: 'Send ETH to the recipient address, then resend this request with the tx hash in input.txHash or x-tx-hash header.'
                }
            }
        });
    }

    // Unknown method
    res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found. Use tasks/send.' } });
});

async function handleA2ASkill(skill, input, id, res) {
    try {
        switch (skill) {
            case 'signals': {
                const limit = parseInt(input.limit) || 20;
                const minScore = parseInt(input.minScore) || 0;
                const signals = curator.memory.highSignals
                    .filter(s => s.score >= minScore)
                    .sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, limit);
                return res.json({ jsonrpc: '2.0', id, result: { status: 'completed', data: { count: signals.length, signals } } });
            }
            case 'briefing': {
                const { runNewsCycle } = require('./news-cycle');
                const result = await runNewsCycle({ storeOnDA: false });
                return res.json({ jsonrpc: '2.0', id, result: { status: 'completed', data: { briefing: result.briefing, articleCount: result.articleCount } } });
            }
            case 'stats': {
                return res.json({ jsonrpc: '2.0', id, result: { status: 'completed', data: { feeds: 7, seenItems: curator.memory.seenHashes.length, highSignals: curator.memory.highSignals.length } } });
            }
            default:
                return res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown skill: ${skill}. Available: signals, briefing, stats` } });
        }
    } catch (err) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
    }
}

// ── Public Routes ───────────────────────────────

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

// Get high-signal items (premium — requires payment)
app.get('/api/signals', paidMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const minScore = parseInt(req.query.minScore) || 0;
    const signals = curator.memory.highSignals
        .filter(s => s.score >= minScore)
        .sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    res.json({ count: signals.length, signals, attestation: getAttestation() });
});

// Get latest news briefing (premium — requires payment)
app.get('/api/briefing', paidMiddleware, async (req, res) => {
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
