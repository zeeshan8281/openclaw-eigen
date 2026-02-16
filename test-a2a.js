/**
 * Agent B Simulator — tests the full A2A payment flow against Alfred
 *
 * Usage: AGENT_PRIVATE_KEY=0x... node test-a2a.js
 *
 * The private key should be for a wallet with Sepolia ETH.
 * Export your MetaMask private key: Account Details → Export Private Key
 */

const { ethers } = require('ethers');
const http = require('http');

const ALFRED_URL = 'http://localhost:3001';
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;

if (!AGENT_KEY) {
    console.error('Set AGENT_PRIVATE_KEY env var (wallet with Sepolia ETH)');
    console.error('Usage: AGENT_PRIVATE_KEY=0x... node test-a2a.js');
    process.exit(1);
}

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, ALFRED_URL);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'content-type': 'application/json' }
        };
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        if (body) req.end(JSON.stringify(body));
        else req.end();
    });
}

function a2a(skill, input = {}) {
    return request('POST', '/a2a', {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tasks/send',
        params: { task: { skill, input } }
    });
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    const wallet = new ethers.Wallet(AGENT_KEY);
    console.log('=== Agent B Simulator ===');
    console.log('Agent wallet:', wallet.address);
    console.log('');

    // Step 1: Discover Alfred
    console.log('--- Step 1: Discover Alfred ---');
    const card = await request('GET', '/.well-known/agent.json');
    console.log('Name:', card.name);
    console.log('Skills:', card.skills.map(s => s.id).join(', '));
    console.log('Payment:', card.payment.amount, card.payment.token, 'on', card.payment.network);
    console.log('Recipient:', card.payment.recipient);
    console.log('');

    // Step 2: Try free endpoint (stats)
    console.log('--- Step 2: Request stats (free) ---');
    const stats = await a2a('stats');
    console.log('Status:', stats.result.status);
    console.log('Data:', JSON.stringify(stats.result.data));
    console.log('');

    // Step 3: Try premium endpoint (signals) — should require payment
    console.log('--- Step 3: Request signals (no payment) ---');
    const denied = await a2a('signals', { limit: 5 });
    console.log('Status:', denied.result.status);
    if (denied.result.payment) {
        console.log('Payment required:', denied.result.payment.amount, 'ETH to', denied.result.payment.recipient);
    }
    console.log('');

    // Step 4: Send payment on Sepolia
    console.log('--- Step 4: Send payment ---');
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    const signer = wallet.connect(provider);

    const balance = await provider.getBalance(wallet.address);
    console.log('Balance:', ethers.formatEther(balance), 'Sepolia ETH');

    const amountWei = ethers.parseEther(card.payment.amount);
    if (balance < amountWei + ethers.parseEther('0.0005')) {
        console.error('Insufficient balance! Need at least', card.payment.amount, '+ gas');
        process.exit(1);
    }

    console.log('Sending', card.payment.amount, 'ETH to', card.payment.recipient, '...');
    const tx = await signer.sendTransaction({
        to: card.payment.recipient,
        value: amountWei
    });
    console.log('Tx hash:', tx.hash);
    console.log('Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log('Confirmed in block', receipt.blockNumber, '| Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    console.log('');

    if (receipt.status !== 1) {
        console.error('Transaction failed!');
        process.exit(1);
    }

    // Step 5: Retry with tx hash
    console.log('--- Step 5: Request signals (with tx hash) ---');
    const result = await a2a('signals', { limit: 5, txHash: tx.hash });
    console.log('Status:', result.result.status);
    if (result.result.data) {
        console.log('Signals received:', result.result.data.count);
        for (const s of (result.result.data.signals || []).slice(0, 3)) {
            console.log(`  [${s.score}/10] ${s.title.substring(0, 80)}`);
        }
    }
    console.log('');

    console.log('=== A2A Payment Flow Complete ===');
})();
