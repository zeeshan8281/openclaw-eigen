/**
 * Article Scorer / Filter
 * 
 * Scores and ranks articles by relevance without needing an LLM.
 * Uses keyword matching, source weight, and recency.
 */

// Topic keywords with weights
const TOPIC_WEIGHTS = {
    // Crypto / web3 — high priority
    'bitcoin': 3, 'btc': 3, 'ethereum': 3, 'eth': 3, 'crypto': 2,
    'defi': 3, 'nft': 2, 'blockchain': 2, 'solana': 2, 'layer 2': 3,
    'rollup': 3, 'eigenlayer': 5, 'restaking': 4, 'avs': 4,
    'staking': 3, 'airdrop': 2, 'token': 2, 'dao': 2,
    // AI / tech
    'ai': 2, 'artificial intelligence': 2, 'machine learning': 2, 'llm': 3,
    'openai': 2, 'anthropic': 2, 'gpu': 2, 'inference': 3,
    // Market
    'sec': 2, 'regulation': 2, 'etf': 3, 'fed': 2, 'rate': 1,
    'bull': 1, 'bear': 1, 'rally': 1, 'crash': 2,
    // Negative (lower priority)
    'meme': -1, 'celebrity': -2, 'scam': -1,
};

// Source credibility multiplier
const SOURCE_MULT = {
    'CoinDesk': 1.2,
    'Blockworks': 1.3,
    'The Block': 1.2,
    'CoinTelegraph': 1.0,
    'Decrypt': 1.1,
    'TechCrunch': 1.1,
    'Hacker News': 1.0,
};

/**
 * Score a single article
 */
function scoreArticle(article) {
    const text = `${article.title} ${article.snippet}`.toLowerCase();
    let score = 0;

    // Keyword scoring
    for (const [keyword, weight] of Object.entries(TOPIC_WEIGHTS)) {
        if (text.includes(keyword)) {
            score += weight;
        }
    }

    // HN score bonus (if available)
    if (article.score) {
        score += Math.min(article.score / 100, 3); // cap at +3
    }

    // Recency bonus: articles from last 2 hours get +2
    if (article.pubDate) {
        const ageMs = Date.now() - new Date(article.pubDate).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        if (ageHours < 2) score += 2;
        else if (ageHours < 4) score += 1;
    }

    // Source multiplier
    const mult = SOURCE_MULT[article.source] || 1.0;
    score *= mult;

    return { ...article, relevanceScore: Math.round(score * 100) / 100 };
}

/**
 * Score and rank articles, returning top N
 * @param {Array} articles - Raw articles
 * @param {number} topN - Number to return (default 10)
 * @returns {Array} Scored and sorted articles
 */
function scoreAndRank(articles, topN = 10) {
    const scored = articles.map(scoreArticle);
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const top = scored.slice(0, topN);
    console.log(`[Scorer] Ranked ${articles.length} articles, returning top ${top.length}`);
    return top;
}

module.exports = { scoreAndRank, scoreArticle };
