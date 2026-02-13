const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { EigenAIService } = require('./services/eigenai');
const { OpenRouterService } = require('./services/openrouter');

const RSS_FEEDS = [
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss',
    'https://blog.ethereum.org/feed.xml',
    'https://vitalik.ca/feed.xml'
];

const MEMORY_FILE = path.join(__dirname, '../data/curator_memory.json');
const MAX_HISTORY = 200; // Only keep verify hash of last 200 items

class Curator {
    constructor() {
        this.parser = new Parser();
        this.eigenai = new EigenAIService();
        this.openrouter = new OpenRouterService();
        this.memory = this.loadMemory();
        this.isRunning = false;
    }

    loadMemory() {
        try {
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
            // Atomic write: write to temp then rename
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

        console.log('🔍 [Curator] Starting curation cycle...');

        try {
            for (const feedUrl of RSS_FEEDS) {
                await this.processFeed(feedUrl);
            }

            // Prune memory
            if (this.memory.seenHashes.length > MAX_HISTORY) {
                this.memory.seenHashes = this.memory.seenHashes.slice(-MAX_HISTORY);
            }

            this.saveMemory();
            console.log('✅ [Curator] Cycle complete.');

        } catch (err) {
            console.error('⚠️ [Curator] Cycle failed (Recovering...):', err.message);
        } finally {
            this.isRunning = false;
        }
    }

    async processFeed(url) {
        try {
            // Set a timeout for the feed parser
            const feed = await Promise.race([
                this.parser.parseURL(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);

            console.log(`📄 [Curator] Fetched ${feed.items.length} items from ${feed.title || url}`);

            for (const item of feed.items) {
                // Simple hash of title to deduplicate
                const hash = Buffer.from(item.title).toString('base64');
                if (this.memory.seenHashes.includes(hash)) continue;

                // New item! Score it.
                await this.scoreItem(item);

                // Mark as seen
                this.memory.seenHashes.push(hash);
            }

        } catch (err) {
            console.warn(`⚠️ [Curator] Failed to process feed ${url}: ${err.message}`);
        }
    }

    async scoreItem(item) {
        // Safe LLM call with strict timeout
        try {
            // Prompt: "Rate importance 1-10. Output NUMBER ONLY."
            const prompt = `Analyze this crypto news headline: "${item.title}".
            Rate its importance to the crypto industry on a scale of 1-10.
            1 = Spam/Noise. 10 = Critical Industry Event (e.g. ETF Approval, Hack >$100M).
            Return ONLY the number.`;

            // Use OPENROUTER preferentially
            let res;
            if (this.openrouter.apiKey) {
                res = await this.openrouter.chatCompletion("You are a strict news editor.", prompt, 10);
            } else {
                // Fallback to EigenAI
                res = await this.eigenai.chatCompletion("You are a strict news editor.", prompt, 10);
            }

            const score = parseInt(res.content.replace(/\D/g, '')); // Extract number

            if (!isNaN(score) && score >= 8) {
                console.log(`🚨 [Curator] HIGH SIGNAL (${score}/10): ${item.title}`);
                this.memory.highSignals.push({
                    title: item.title,
                    link: item.link,
                    score: score,
                    timestamp: new Date().toISOString()
                });
                return true; // Signal found!
            } else {
                // console.log(`[Curator] Low signal (${score}/10): ${item.title}`);
            }

        } catch (err) {
            // Logic error in LLM or parsing? Don't crash. Just ignore item.
            console.warn(`[Curator] Scoring failed for item "${item.title.substring(0, 20)}...": ${err.message}`);
        }
        return false;
    }

    getDetails() {
        return `🧠 **Curator Memory:**\n- Tracking ${RSS_FEEDS.length} Feeds\n- Seen ${this.memory.seenHashes.length} items\n- Found ${this.memory.highSignals.length} Active Signals`;
    }
}

module.exports = Curator;
