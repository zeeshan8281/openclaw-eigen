/**
 * RSS Feed Ingester
 * 
 * Fetches articles from crypto/tech RSS feeds.
 * Returns normalized article objects.
 */

const Parser = require('rss-parser');
const parser = new Parser({ timeout: 15000 });

const FEEDS = [
    { name: 'CoinDesk',   url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Blockworks',  url: 'https://blockworks.co/feed' },
    { name: 'Decrypt',     url: 'https://decrypt.co/feed' },
    { name: 'The Block',   url: 'https://www.theblock.co/rss.xml' },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'TechCrunch',  url: 'https://techcrunch.com/feed/' },
];

/**
 * Fetch articles from all RSS feeds
 * @param {number} maxAge - Max article age in hours (default 8)
 * @returns {Promise<Array<{title, link, source, pubDate, snippet}>>}
 */
async function fetchRSSFeeds(maxAge = 8) {
    const cutoff = Date.now() - maxAge * 60 * 60 * 1000;
    const articles = [];

    const results = await Promise.allSettled(
        FEEDS.map(async (feed) => {
            try {
                const parsed = await parser.parseURL(feed.url);
                const items = (parsed.items || [])
                    .filter(item => {
                        const pub = item.pubDate ? new Date(item.pubDate).getTime() : 0;
                        return pub > cutoff;
                    })
                    .map(item => ({
                        title: (item.title || '').trim(),
                        link: item.link || '',
                        source: feed.name,
                        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
                        snippet: (item.contentSnippet || item.content || '').substring(0, 300).trim()
                    }));
                return items;
            } catch (err) {
                console.warn(`[RSS] Failed to fetch ${feed.name}: ${err.message}`);
                return [];
            }
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
            articles.push(...result.value);
        }
    }

    console.log(`[RSS] Fetched ${articles.length} articles from ${FEEDS.length} feeds`);
    return articles;
}

module.exports = { fetchRSSFeeds, FEEDS };
