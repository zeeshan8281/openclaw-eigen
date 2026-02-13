/**
 * Health Check — Verify all services are ready before running the pipeline
 */

const { OllamaService } = require('./services/ollama');
const { EigenAIService } = require('./services/eigenai');
const { EigenDAService } = require('./services/eigenda');
require('dotenv').config();

async function healthCheck() {
    console.log('\n🏥 Service Health Check');
    console.log('══════════════════════════════════════\n');

    const ollama = new OllamaService();
    const eigenai = new EigenAIService();
    const eigenda = new EigenDAService();

    const results = {};

    // 1. Ollama
    console.log('1. Ollama (Local LLM)');
    results.ollama = await ollama.healthCheck();
    if (results.ollama) {
        const models = await ollama.listModels();
        console.log(`   Models: ${models.map(m => m.name).join(', ')}\n`);
    } else {
        console.log('   ❌ Not running. Fix: ollama serve\n');
    }

    // 2. EigenAI
    console.log('2. EigenAI (Verifiable Inference)');
    results.eigenai = await eigenai.healthCheck();
    if (results.eigenai) {
        const grant = await eigenai.checkGrant();
        if (grant) {
            console.log(`   Tokens remaining: ${grant.tokenCount || 'unknown'}\n`);
        }
    } else {
        console.log('   ❌ Grant check failed. Get tokens at: https://terminal.eigencloud.xyz\n');
    }

    // 3. EigenDA
    console.log('3. EigenDA Proxy');
    results.eigenda = await eigenda.healthCheck();
    if (!results.eigenda) {
        console.log('   ❌ Proxy not running. Start: docker run eigenda-proxy\n');
    } else {
        console.log('');
    }

    // Summary
    const allGood = Object.values(results).every(Boolean);
    console.log('══════════════════════════════════════');
    if (allGood) {
        console.log('✅ All services healthy — ready to run pipeline!');
        console.log('   npm run pipeline "Your topic here"');
    } else {
        console.log('⚠️  Some services unavailable:');
        if (!results.ollama) console.log('   - Ollama: required for research + drafting');
        if (!results.eigenai) console.log('   - EigenAI: optional, needed for verification');
        if (!results.eigenda) console.log('   - EigenDA: optional, needed for on-chain proofs');
        console.log('\n   Pipeline can still run in degraded mode (drafts only).');
    }
    console.log('');
}

healthCheck();
