/**
 * Hacker News Ingester
 * 
 * Fetches top stories from the HN API.
 * Returns normalized article objects.
 */

const axios = require('axios');

const HN_API = 'https://hacker-news.firebaseio.com/v0';

/**
 * Fetch top N stories from Hacker News
 * @param {number} count - Number of stories to fetch (default 15)
 * @returns {Promise<Array<{title, link, source, pubDate, snippet, score}>>}
 */
async function fetchHackerNews(count = 15) {
    try {
        const { data: topIds } = await axios.get(`${HN_API}/topstories.json`, { timeout: 10000 });
        const ids = topIds.slice(0, count);

        const stories = await Promise.allSettled(
            ids.map(id =>
                axios.get(`${HN_API}/item/${id}.json`, { timeout: 5000 }).then(r => r.data)
            )
        );

        const articles = stories
            .filter(r => r.status === 'fulfilled' && r.value && r.value.title)
            .map(r => {
                const s = r.value;
                return {
                    title: s.title,
                    link: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
                    source: 'Hacker News',
                    pubDate: s.time ? new Date(s.time * 1000).toISOString() : null,
                    snippet: s.text ? s.text.substring(0, 300).replace(/<[^>]+>/g, '') : '',
                    score: s.score || 0
                };
            });

        console.log(`[HN] Fetched ${articles.length} stories`);
        return articles;
    } catch (err) {
        console.error(`[HN] Failed: ${err.message}`);
        return [];
    }
}

module.exports = { fetchHackerNews };
