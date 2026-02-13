/**
 * Source Aggregator
 * 
 * Combines articles from all ingest sources,
 * deduplicates by title similarity, and returns a unified feed.
 */

const { fetchRSSFeeds } = require('./rss');
const { fetchHackerNews } = require('./hn');

/**
 * Simple title normalization for dedup
 */
function normalizeTitle(title) {
    return (title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fetch and aggregate from all sources
 * @param {object} opts
 * @param {number} opts.maxAge - Max article age in hours
 * @param {number} opts.hnCount - Number of HN stories
 * @returns {Promise<Array>} Deduplicated articles
 */
async function aggregateAll(opts = {}) {
    const { maxAge = 8, hnCount = 15 } = opts;

    const [rssArticles, hnArticles] = await Promise.all([
        fetchRSSFeeds(maxAge),
        fetchHackerNews(hnCount)
    ]);

    const all = [...rssArticles, ...hnArticles];

    // Deduplicate by normalized title
    const seen = new Set();
    const unique = [];
    for (const article of all) {
        const key = normalizeTitle(article.title);
        if (key.length < 5) continue; // skip empty/garbage
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(article);
    }

    console.log(`[Aggregator] ${all.length} total → ${unique.length} unique articles`);
    return unique;
}

module.exports = { aggregateAll };
