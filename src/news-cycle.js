/**
 * News Cycle Orchestrator
 * 
 * Runs the full pipeline:
 * 1. Ingest from RSS + HN
 * 2. Score and rank
 * 3. Format as briefing (no LLM needed)
 * 4. Store proof on EigenDA
 * 5. Return formatted briefing
 * 
 * Can be called by OpenClaw skill or run standalone.
 */

const { aggregateAll } = require('./ingest/aggregator');
const { scoreAndRank } = require('./filter/scorer');
const { generateBriefing } = require('./summarize/briefing');
const { storeProof } = require('./verify/proofs');

/**
 * Run a full news cycle
 * @param {object} opts
 * @param {number} opts.maxAge - Max article age in hours (default 8)
 * @param {number} opts.topN - Number of articles to include (default 10)
 * @param {boolean} opts.storeOnDA - Whether to store proof on EigenDA (default true)
 * @returns {Promise<{briefing: string, proof: object, articleCount: number}>}
 */
async function runNewsCycle(opts = {}) {
    const { maxAge = 8, topN = 10, storeOnDA = true } = opts;
    const startTime = Date.now();

    console.log('[NewsCycle] Starting news cycle...');

    // Step 1: Ingest
    const articles = await aggregateAll({ maxAge });
    if (articles.length === 0) {
        console.log('[NewsCycle] No articles found — skipping cycle');
        return {
            briefing: 'No notable news in the last cycle.',
            proof: null,
            articleCount: 0
        };
    }

    // Step 2: Score and rank
    const ranked = scoreAndRank(articles, topN);

    // Step 3: Format briefing (no LLM — just curated headlines)
    const briefing = generateBriefing(ranked);

    // Step 4: Store proof (optional, gracefully degrades)
    let proof = null;
    if (storeOnDA) {
        proof = await storeProof({
            briefing,
            articles: ranked.map(a => ({
                title: a.title,
                source: a.source,
                link: a.link,
                score: a.relevanceScore
            }))
        });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[NewsCycle] Done in ${elapsed}s — ${ranked.length} articles summarized`);

    return {
        briefing,
        proof,
        articleCount: ranked.length
    };
}

// Allow standalone execution: node src/news-cycle.js
if (require.main === module) {
    runNewsCycle({ storeOnDA: false })
        .then(result => {
            console.log('\n--- BRIEFING ---');
            console.log(result.briefing);
            console.log(`\n[${result.articleCount} articles processed]`);
        })
        .catch(err => {
            console.error('News cycle failed:', err);
            process.exit(1);
        });
}

module.exports = { runNewsCycle };
