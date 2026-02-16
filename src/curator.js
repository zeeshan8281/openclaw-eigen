const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Parser = require('rss-parser');
const { OpenRouterService } = require('./services/openrouter');

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

const RSS_FEEDS = [
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss',
    'https://blog.ethereum.org/feed.xml',
    'https://vitalik.ca/feed.xml',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://hnrss.org/frontpage?count=30'
];

const MEMORY_FILE = path.join(__dirname, '../data/curator_memory.json');
const MAX_HISTORY = 500;
const MAX_SCORE_PER_CYCLE = 20; // Score up to 20 items per cycle
const SCORE_DELAY_MS = 2000; // 2s between LLM calls to avoid rate limits

class Curator {
    constructor() {
        this.parser = new Parser();
        this.openrouter = new OpenRouterService();
        this.memory = this.loadMemory();
        this.isRunning = false;
    }

    loadMemory() {
        try {
            // Ensure data dir exists
            const dir = path.dirname(MEMORY_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(MEMORY_FILE)) {
                return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
            }
        } catch (err) {
            console.error('[Curator] Failed to load memory:', err.message);
        }
        return { seenHashes: [], highSignals: [] };
    }

    saveMemory() {
        try {
            const dir = path.dirname(MEMORY_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const tempFile = `${MEMORY_FILE}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(this.memory, null, 2));
            fs.renameSync(tempFile, MEMORY_FILE);
        } catch (err) {
            console.error('[Curator] Failed to save memory:', err.message);
        }
    }

    async runCycle() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('[Curator] Starting cycle...');

        try {
            // Collect all new items first
            const newItems = [];
            for (const feedUrl of RSS_FEEDS) {
                const items = await this.fetchNewItems(feedUrl);
                newItems.push(...items);
            }

            // Fetch Twitter items
            const twitterItems = await this.fetchTwitterItems();
            newItems.push(...twitterItems);

            console.log(`[Curator] ${newItems.length} new items to score`);

            // Score items with delays to avoid rate limits
            const toScore = newItems.slice(0, MAX_SCORE_PER_CYCLE);
            let scored = 0;
            let failed = 0;
            for (const item of toScore) {
                const success = await this.scoreItem(item);
                if (success) scored++; else failed++;
                // Mark as seen regardless of score result
                const hash = Buffer.from(item.title).toString('base64');
                this.memory.seenHashes.push(hash);
                if (toScore.indexOf(item) < toScore.length - 1) {
                    await new Promise(r => setTimeout(r, SCORE_DELAY_MS));
                }
            }
            console.log(`[Curator] Scored ${scored} items (${failed} failed) out of ${toScore.length}`);

            // DON'T mark remaining items as seen — they'll be scored in the next cycle
            if (newItems.length > MAX_SCORE_PER_CYCLE) {
                console.log(`[Curator] ${newItems.length - MAX_SCORE_PER_CYCLE} items deferred to next cycle`);
            }

            // Prune memory
            if (this.memory.seenHashes.length > MAX_HISTORY) {
                this.memory.seenHashes = this.memory.seenHashes.slice(-MAX_HISTORY);
            }

            this.saveMemory();
            console.log('[Curator] Cycle complete.');

        } catch (err) {
            console.error('[Curator] Cycle failed:', err.message);
        } finally {
            this.isRunning = false;
        }
    }

    async fetchNewItems(url) {
        try {
            const feed = await Promise.race([
                this.parser.parseURL(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);

            const newItems = [];
            for (const item of feed.items) {
                if (!item.title) continue;
                const hash = Buffer.from(item.title).toString('base64');
                if (!this.memory.seenHashes.includes(hash)) {
                    newItems.push(item);
                }
            }
            console.log(`[Curator] ${feed.title || url}: ${newItems.length} new / ${feed.items.length} total`);
            return newItems;
        } catch (err) {
            console.warn(`[Curator] Feed failed ${url}: ${err.message}`);
            return [];
        }
    }

    async fetchTwitterItems() {
        if (!X_BEARER_TOKEN) {
            console.log('[Curator] Twitter: no X_BEARER_TOKEN set, skipping');
            return [];
        }
        try {
            const res = await axios.get('https://api.x.com/2/tweets/search/recent', {
                headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
                params: {
                    query: '(bitcoin OR ethereum OR crypto OR AI) -is:retweet -is:reply lang:en',
                    max_results: 10,
                    'tweet.fields': 'author_id,created_at',
                    expansions: 'author_id'
                },
                timeout: 10000
            });

            const tweets = res.data?.data || [];
            const users = {};
            for (const u of (res.data?.includes?.users || [])) {
                users[u.id] = u.username;
            }

            const newItems = [];
            for (const tweet of tweets) {
                const hash = Buffer.from(tweet.text).toString('base64');
                if (this.memory.seenHashes.includes(hash)) continue;
                const username = users[tweet.author_id] || tweet.author_id;
                newItems.push({
                    title: tweet.text,
                    link: `https://x.com/${username}/status/${tweet.id}`,
                    creator: `@${username}`
                });
            }

            console.log(`[Curator] Twitter: ${newItems.length} new / ${tweets.length} total`);
            return newItems;
        } catch (err) {
            console.warn(`[Curator] Twitter fetch failed: ${err.message}`);
            return [];
        }
    }

    async scoreItem(item) {
        let score = this.keywordScore(item.title);

        // Try LLM scoring, fall back to keyword score
        try {
            const prompt = `Rate this news headline from 1-10 based on significance and novelty. Topics: crypto, blockchain, AI, technology, business, macro economics. 1=routine/spam, 5=mildly interesting, 8=important development, 10=critical breaking event. Reply with ONLY a single digit number.\n\n"${item.title}"`;

            const res = await this.openrouter.chatCompletion("Reply with only a single number from 1 to 10. No other text.", prompt, 50);
            const cleaned = res.content.trim().replace(/[^0-9]/g, '');
            const llmScore = parseInt(cleaned);

            if (!isNaN(llmScore) && llmScore >= 1 && llmScore <= 10) {
                score = llmScore;
                console.log(`[Curator] LLM score ${score}/10: ${item.title}`);
            } else {
                console.warn(`[Curator] LLM parse fail — raw: "${res.content}", using keyword score ${score}`);
            }
        } catch (err) {
            console.warn(`[Curator] LLM score failed (${err.message}), using keyword score ${score}`);
        }

        // Store ALL items with their scores (even low ones get tracked)
        this.memory.highSignals.push({
            title: item.title,
            link: item.link,
            source: item.creator || item.author || '',
            score,
            timestamp: new Date().toISOString()
        });

        return true;
    }

    // Keyword-based fallback scoring
    keywordScore(title) {
        const t = title.toLowerCase();
        let score = 5; // baseline

        // High-value keywords
        const highKeywords = ['bitcoin', 'ethereum', 'btc', 'eth', 'regulation', 'sec', 'hack', 'breach',
            'ai ', 'artificial intelligence', 'gpt', 'llm', 'openai', 'google', 'apple', 'microsoft',
            'billion', 'million', 'ipo', 'acquisition', 'merger', 'crash', 'surge', 'record',
            'war', 'sanctions', 'fed ', 'interest rate', 'inflation', 'recession'];
        const medKeywords = ['crypto', 'blockchain', 'defi', 'nft', 'web3', 'token', 'stablecoin',
            'startup', 'funding', 'raised', 'launch', 'release', 'update', 'upgrade'];

        for (const kw of highKeywords) {
            if (t.includes(kw)) { score += 2; break; }
        }
        for (const kw of medKeywords) {
            if (t.includes(kw)) { score += 1; break; }
        }

        return Math.min(score, 10);
    }

    getDetails() {
        return `Curator: ${RSS_FEEDS.length} RSS feeds + Twitter, ${this.memory.seenHashes.length} seen, ${this.memory.highSignals.length} signals`;
    }
}

module.exports = Curator;
