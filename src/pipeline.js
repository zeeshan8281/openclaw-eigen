/**
 * Content Pipeline — Multi-Agent Orchestration
 * 
 * Flow:
 *   1. SEO Researcher (Ollama, FREE) → keywords + outline
 *   2. Draft Writer (Ollama, FREE) → 2000+ word technical article
 *   3. Verification Pass (EigenAI, wallet-signed) → polished + cryptographic proof
 *   4. Store Proof (EigenDA, local proxy) → commitment hash on-chain
 * 
 * Token budget: Only step 3 costs EigenAI tokens (~15-20K per article)
 */

const fs = require('fs');
const path = require('path');
const { OllamaService } = require('./services/ollama');
const { EigenAIService } = require('./services/eigenai');
const { EigenDAService } = require('./services/eigenda');
require('dotenv').config();

const OUTPUT_DIR = '/tmp/output';

const ollama = new OllamaService();
const eigenai = new EigenAIService();
const eigenda = new EigenDAService();

// ─────────────────────────────────────────────────
// Agent 1: SEO Researcher (FREE — Ollama)
// ─────────────────────────────────────────────────
async function researchAgent(topic) {
    console.log('\n═══════════════════════════════════════');
    console.log('📚 AGENT 1: SEO Researcher (Ollama)');
    console.log('═══════════════════════════════════════\n');

    const prompt = `You are an expert SEO researcher for technical/developer content.

Topic: "${topic}"

Provide:
1. **Primary keyword** and 5 secondary keywords
2. **Search intent** (what developers are actually looking for)
3. **Content outline** with H2/H3 headings (aim for 2000+ words)
4. **Key technical concepts** that MUST be explained
5. **Competitor gap** — what existing articles miss
6. **Hook angle** — what makes THIS article worth reading

Format your output as structured markdown.`;

    return await ollama.generate(prompt, { temperature: 0.5 });
}

// ─────────────────────────────────────────────────
// Agent 2: Draft Writer (FREE — Ollama)
// ─────────────────────────────────────────────────
async function writerAgent(topic, research) {
    console.log('\n═══════════════════════════════════════');
    console.log('✍️  AGENT 2: Draft Writer (Ollama)');
    console.log('═══════════════════════════════════════\n');

    const prompt = `You are a senior technical writer creating content for a developer blog.

Topic: "${topic}"

SEO Research & Outline:
${research}

Write a COMPLETE technical article following these rules:
- 2000+ words minimum
- Use the H2/H3 structure from the research
- Include code examples where relevant
- Explain concepts for mid-level developers
- Use short paragraphs, bullet points, and clear headers
- Start with a compelling hook, NOT "In this article..."
- End with actionable next steps
- Write in an authoritative but accessible tone

Output the full article in markdown format.`;

    return await ollama.generate(prompt, {
        temperature: 0.7,
        maxTokens: 8192 // Long-form content
    });
}

// ─────────────────────────────────────────────────
// Agent 3: Verification Pass (EigenAI — wallet auth)
// ─────────────────────────────────────────────────
async function verifierAgent(draft) {
    console.log('\n═══════════════════════════════════════');
    console.log('🛡️  AGENT 3: Verifier (EigenAI)');
    console.log('═══════════════════════════════════════\n');

    // Check grant status first
    const grantStatus = await eigenai.checkGrant();
    if (grantStatus) {
        console.log(`[Pipeline] Token budget remaining: ${grantStatus.tokenCount || 'unknown'}`);
    }

    const systemPrompt = `You are a senior technical editor. Polish this technical article for:
1. Technical accuracy — fix any factual errors
2. Clarity — simplify complex explanations
3. SEO — ensure keyword placement is natural
4. Readability — improve flow and transitions
5. Completeness — flag any missing critical information

Return the FINAL polished version of the article. Do not add commentary — just return the improved article.`;

    const result = await eigenai.chatCompletion(systemPrompt, draft, 4096);
    return result;
}

// ─────────────────────────────────────────────────
// Agent 4: Store Proof on EigenDA
// ─────────────────────────────────────────────────
async function storeProof(topic, content, eigenaiResponse) {
    console.log('\n═══════════════════════════════════════');
    console.log('📦 Storing Verification Proof (EigenDA)');
    console.log('═══════════════════════════════════════\n');

    const proof = {
        topic,
        content_length: content.length,
        model: eigenaiResponse.model,
        usage: eigenaiResponse.usage,
        timestamp: new Date().toISOString(),
        wallet_address: process.env.WALLET_ADDRESS,
        content_preview: content.substring(0, 500),
    };

    try {
        const commitment = await eigenda.store(proof);
        console.log(`[Pipeline] ✅ Proof stored on EigenDA`);
        console.log(`[Pipeline] 🔗 View: https://blobs-sepolia.eigenda.xyz/blobs/${commitment}`);
        return commitment;
    } catch (error) {
        console.warn(`[Pipeline] ⚠️  EigenDA store failed (non-fatal): ${error.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────
// Full Pipeline Orchestration
// ─────────────────────────────────────────────────
async function runPipeline(topic) {
    const startTime = Date.now();

    console.log('\n🚀 ═══════════════════════════════════════════════════════');
    console.log(`   VERIFIABLE CONTENT PIPELINE`);
    console.log(`   Topic: "${topic}"`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Health checks
    const ollamaOk = await ollama.healthCheck().catch(() => false);
    const eigenaiOk = await eigenai.healthCheck();
    const eigendaOk = await eigenda.healthCheck();

    // Step 1: Research
    let research;
    if (ollamaOk) {
        research = await researchAgent(topic);
    } else if (eigenaiOk) {
        console.log('[Pipeline] Using EigenAI for Research...');
        const res = await eigenai.chatCompletion("You are an expert SEO researcher. Output structured markdown.", `Research topic: ${topic}`, 1000);
        research = res.content;
    } else {
        throw new Error('No LLM services available');
    }
    console.log(`\n📊 Research complete (${research.length} chars)\n`);

    // Step 2: Draft
    let draft;
    if (ollamaOk) {
        draft = await writerAgent(topic, research);
    } else if (eigenaiOk) {
        console.log('[Pipeline] Using EigenAI for Drafting...');
        const res = await eigenai.chatCompletion("You are a senior technical writer. Write a complete technical article in markdown.", `Topic: ${topic}\n\nResearch:\n${research}`, 4092);
        draft = res.content;
    }
    console.log(`\n📝 Draft complete (${draft.length} chars)\n`);

    // Step 3: Verify (EigenAI tokens)
    let finalContent = draft;
    let eigenaiResponse = null;
    let commitment = null;

    if (eigenaiOk) {
        // If we already used EigenAI for draft, we can skip editorial pass or do a light one
        eigenaiResponse = await verifierAgent(draft);
        finalContent = eigenaiResponse.content;
        console.log(`\n✅ Verified content (${finalContent.length} chars)\n`);

        // Step 4: Store proof (EigenDA)
        if (eigendaOk) {
            commitment = await storeProof(topic, finalContent, eigenaiResponse);
        }
    } else {
        console.log('\n⚠️  Skipping verification — using unverified draft\n');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   ✅ PIPELINE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Topic:      ${topic}`);
    console.log(`   Words:      ~${Math.round(finalContent.split(/\s+/).length)}`);
    console.log(`   Verified:   ${eigenaiOk ? 'Yes (EigenAI)' : 'No (draft only)'}`);
    const commitmentDisplay = commitment
        ? (typeof commitment === 'string' ? commitment : commitment.toString('hex')).substring(0, 40) + '...'
        : 'N/A';
    console.log(`   EigenDA:    ${commitmentDisplay.startsWith('0x') ? commitmentDisplay : '0x' + commitmentDisplay}`);
    console.log(`   Time:       ${elapsed}s`);
    console.log(`   Cost:       $0 (${eigenaiOk ? '~20K tokens from free pool' : 'local only'})`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // ─── Save outputs to files ───
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const articleDir = path.join(OUTPUT_DIR, `${ts}_${slug}`);
    fs.mkdirSync(articleDir, { recursive: true });

    // 1. Research notes
    fs.writeFileSync(path.join(articleDir, '1-research.md'), `# Research: ${topic}\n\n${research}`);

    // 2. Draft
    fs.writeFileSync(path.join(articleDir, '2-draft.md'), draft);

    // 3. Final verified article
    fs.writeFileSync(path.join(articleDir, '3-final-article.md'), finalContent);

    // 4. Proof metadata
    const proofData = {
        topic,
        word_count: Math.round(finalContent.split(/\s+/).length),
        verified: !!eigenaiResponse,
        model: eigenaiResponse?.model || 'ollama/qwen2.5:7b (unverified)',
        usage: eigenaiResponse?.usage || null,
        eigenda_commitment: commitment,
        eigenda_explorer: commitment ? `https://blobs-sepolia.eigenda.xyz/blobs/${commitment}` : null,
        wallet_address: process.env.WALLET_ADDRESS,
        timestamp: new Date().toISOString(),
        pipeline_duration_seconds: parseFloat(elapsed),
    };
    fs.writeFileSync(path.join(articleDir, '4-proof.json'), JSON.stringify(proofData, null, 2));

    console.log(`📁 Output saved to: ${articleDir}`);
    console.log(`   ├── 1-research.md`);
    console.log(`   ├── 2-draft.md`);
    console.log(`   ├── 3-final-article.md`);
    console.log(`   └── 4-proof.json\n`);

    return {
        topic,
        research,
        draft,
        finalContent,
        proof: eigenaiResponse,
        commitment,
        elapsed,
        outputDir: articleDir
    };
}

// CLI entry point
if (require.main === module) {
    const topic = process.argv.slice(2).join(' ') || 'ERC-7702 delegation and its impact on Account Abstraction';
    runPipeline(topic).catch(err => {
        console.error('Pipeline failed:', err);
        process.exit(1);
    });
}

module.exports = { runPipeline };
