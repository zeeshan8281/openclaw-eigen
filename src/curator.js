const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { OpenRouterService } = require('./services/openrouter');

const RSS_FEEDS = [
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss',
    'https://blog.ethereum.org/feed.xml',
    'https://vitalik.ca/feed.xml',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://feeds.bbci.co.uk/news/business/rss.xml'
];

const MEMORY_FILE = path.join(__dirname, '../data/curator_memory.json');
const MAX_HISTORY = 200;
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

            console.log(`[Curator] ${newItems.length} new items to score`);

            // Batch score with delays to avoid rate limits
            // Only score up to 10 items per cycle to stay within free tier
            const toScore = newItems.slice(0, 10);
            for (const item of toScore) {
                await this.scoreItem(item);
                // Mark as seen regardless of score result
                const hash = Buffer.from(item.title).toString('base64');
                this.memory.seenHashes.push(hash);
                if (toScore.indexOf(item) < toScore.length - 1) {
                    await new Promise(r => setTimeout(r, SCORE_DELAY_MS));
                }
            }

            // Mark remaining items as seen (skip scoring to avoid rate limits)
            for (const item of newItems.slice(10)) {
                const hash = Buffer.from(item.title).toString('base64');
                this.memory.seenHashes.push(hash);
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

    async scoreItem(item) {
        try {
            const prompt = `Rate this crypto news headline 1-10. 1=spam, 10=critical event. Reply with ONLY the number.\n\n"${item.title}"`;

            const res = await this.openrouter.chatCompletion("You are a news editor. Reply with only a number.", prompt, 10);
            const score = parseInt(res.content.replace(/\D/g, ''));

            if (!isNaN(score) && score >= 8) {
                console.log(`[Curator] HIGH SIGNAL (${score}/10): ${item.title}`);
                this.memory.highSignals.push({
                    title: item.title,
                    link: item.link,
                    score,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (err) {
            console.warn(`[Curator] Score failed: ${err.message}`);
        }
    }

    getDetails() {
        return `Curator: ${RSS_FEEDS.length} feeds, ${this.memory.seenHashes.length} seen, ${this.memory.highSignals.length} signals`;
    }
}

module.exports = Curator;
