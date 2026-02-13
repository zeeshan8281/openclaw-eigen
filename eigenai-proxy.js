/**
 * EigenAI → OpenAI-Compatible Proxy
 * 
 * Wraps EigenAI's wallet-signed grant auth into a standard
 * OpenAI /v1/chat/completions endpoint. Cleans reasoning tokens
 * from the model output so downstream consumers (OpenClaw) get
 * clean chat responses.
 * 
 * Usage: node eigenai-proxy.js
 * Env:   WALLET_PRIVATE_KEY, WALLET_ADDRESS, EIGENAI_API_URL, EIGENAI_MODEL
 */

const http = require('http');
const axios = require('axios');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

const PORT = parseInt(process.env.EIGENAI_PROXY_PORT || '3002', 10);

// --- Wallet setup ---
const pk = process.env.WALLET_PRIVATE_KEY.startsWith('0x')
    ? process.env.WALLET_PRIVATE_KEY
    : `0x${process.env.WALLET_PRIVATE_KEY}`;
const account = privateKeyToAccount(pk);
const EIGENAI_URL = process.env.EIGENAI_API_URL || 'https://determinal-api.eigenarcade.com';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const DEFAULT_MODEL = process.env.EIGENAI_MODEL || 'gpt-oss-120b-f16';
const SEED = parseInt(process.env.EIGENAI_SEED || '42', 10);
const TIMEOUT = parseInt(process.env.EIGENAI_TIMEOUT || '120000', 10);

/**
 * Strip EigenAI reasoning tokens from model output.
 * The model may output: <|channel|>analysis<|message|>actual response<|end|>
 * Or it may output chain-of-thought like "We need to respond... So: 'actual reply'"
 */
function cleanResponse(raw) {
    if (!raw) return raw;

    // 1. Extract between <|message|> and <|end|>
    const msgMatch = raw.match(/<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/);
    if (msgMatch) {
        raw = msgMatch[1].trim();
    }

    // 2. Strip any remaining special tokens
    raw = raw.replace(/<\|[^|]*\|>/g, '').trim();

    // 3. If it still looks like reasoning, try to extract quoted response
    if (/^(We need to|User (says|asks)|So respond|The user|I should|Let me think)/i.test(raw)) {
        // Try quoted text
        const quotes = raw.match(/"([^"]{8,})"/g);
        if (quotes && quotes.length > 0) {
            // Take the last quoted string (usually the actual response)
            raw = quotes[quotes.length - 1].replace(/^"|"$/g, '');
        }
    }

    return raw;
}

async function handleChatCompletions(req, res, body) {
    try {
        const parsed = JSON.parse(body);
        const messages = parsed.messages || [];
        const maxTokens = parsed.max_tokens || 2000;
        const stream = parsed.stream || false;

        // Step 1: Get grant message
        const grantResp = await axios.get(`${EIGENAI_URL}/message`, {
            params: { address: WALLET_ADDRESS },
            timeout: 10000
        });
        const grantMessage = grantResp.data.message;

        // Step 2: Sign with wallet
        const grantSignature = await account.signMessage({ message: grantMessage });

        // Step 3: Call EigenAI
        const eigenResp = await axios.post(
            `${EIGENAI_URL}/api/chat/completions`,
            {
                messages,
                model: DEFAULT_MODEL,
                max_tokens: maxTokens,
                temperature: parsed.temperature ?? 0.7,
                seed: SEED,
                grantMessage,
                grantSignature,
                walletAddress: WALLET_ADDRESS
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: TIMEOUT
            }
        );

        const data = eigenResp.data;

        // Clean reasoning tokens from response
        if (data?.choices?.[0]?.message?.content) {
            data.choices[0].message.content = cleanResponse(data.choices[0].message.content);
        }

        if (stream) {
            // Fake streaming: emit entire response as one SSE chunk
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            const content = data?.choices?.[0]?.message?.content || '';
            const chunk = {
                id: data.id || `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: data.model || DEFAULT_MODEL,
                choices: [{
                    index: 0,
                    delta: { role: 'assistant', content },
                    finish_reason: 'stop'
                }],
                usage: data.usage || null
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        }

        const content = data?.choices?.[0]?.message?.content || '';
        console.log(`[EigenAI Proxy] OK ${content.length} chars`);
    } catch (err) {
        console.error(`[EigenAI Proxy] Error: ${err.message}`);
        const status = err.response?.status || 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: { message: err.message, type: 'proxy_error', code: status }
        }));
    }
}

function handleModels(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        object: 'list',
        data: [{
            id: DEFAULT_MODEL,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'eigenai'
        }]
    }));
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/v1/models' && req.method === 'GET') return handleModels(req, res);
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => handleChatCompletions(req, res, body));
        return;
    }
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', model: DEFAULT_MODEL, wallet: WALLET_ADDRESS }));
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[EigenAI Proxy] Listening on http://127.0.0.1:${PORT}/v1`);
    console.log(`[EigenAI Proxy] Model: ${DEFAULT_MODEL} | Wallet: ${WALLET_ADDRESS}`);
});
