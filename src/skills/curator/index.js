import Parser from 'rss-parser';
import axios from 'axios';

class OpenRouterService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct:free';
    }

    async chatCompletion(systemPrompt, userPrompt) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');
        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://eigen-openclaw.xyz',
                        'X-Title': 'Eigen OpenClaw Curator'
                    }
                }
            );
            return response.data.choices[0].message;
        } catch (error) {
            console.error('OpenRouter Error:', error.message);
            return { content: '' };
        }
    }
}

export class CuratorSkill {
    constructor(context) {
        this.context = context;
        this.parser = new Parser();
        this.openrouter = new OpenRouterService(process.env.OPENROUTER_API_KEY);
        this.memory = {}; // In-memory cache for simplicity
        this.rssFeeds = [
            'https://cointelegraph.com/rss',
            'https://blog.ethereum.org/feed.xml',
            'https://decrypt.co/feed'
        ];
    }

    async run() {
        this.context.log.info("Starting Curator Run...");
        const items = await this.fetchFeeds();
        const signals = [];

        for (const item of items) {
            if (this.memory[item.guid] || this.memory[item.link]) continue; // Dedupe

            const score = await this.scoreItem(item);
            this.memory[item.guid || item.link] = { processed: true, score };

            if (score >= 7) {
                signals.push({ ...item, score });
                this.context.log.info(`[SIGNAL] (${score}/10) ${item.title}`);

                // Notify via Context/Telegram if available (this assumes context.channels.telegram exists or similar)
                // For now just leverage context methods available
            }
        }

        return signals;
    }

    async fetchFeeds() {
        let allItems = [];
        for (const url of this.rssFeeds) {
            try {
                const feed = await this.parser.parseURL(url);
                allItems = allItems.concat(feed.items.slice(0, 5)); // limit to top 5
            } catch (err) {
                this.context.log.error(`Failed to fetch RSS: ${url}`);
            }
        }
        return allItems;
    }

    async scoreItem(item) {
        const prompt = `Analyze this crypto news headline: "${item.title}".
    Rate its importance to the crypto industry on a scale of 1-10.
    1 = Spam/Noise. 10 = Critical Industry Event.
    Return ONLY the number.`;

        const res = await this.openrouter.chatCompletion("You are a strict news editor.", prompt);
        const score = parseInt(res.content.replace(/\D/g, '')) || 0;
        return score;

    }

    register() {
        // Schedule fetch every 4 hours
        this.context.cron.schedule('0 */4 * * *', () => this.run());

        // Allow manual invocation via command
        this.context.commands.register('curate', () => this.run());

        // Proactive: Run once on start
        setTimeout(() => this.run(), 5000);
    }
}
