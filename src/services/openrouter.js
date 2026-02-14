const axios = require('axios');
require('dotenv').config();

class OpenRouterService {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-nano-9b-v2:free';

        if (!this.apiKey) {
            console.warn('[OpenRouter] OPENROUTER_API_KEY is missing. Service will fail.');
        }
    }

    async chatCompletion(systemPrompt, userPrompt, maxTokens = 500) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');

        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model: this.model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        max_tokens: maxTokens,
                        temperature: 0.1,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'HTTP-Referer': 'https://eigen-openclaw.xyz',
                            'X-Title': 'Eigen OpenClaw',
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                const content = response.data?.choices?.[0]?.message?.content;
                if (!content) throw new Error('No content in OpenRouter response');

                return {
                    content,
                    usage: response.data?.usage || {},
                    model: response.data?.model || this.model
                };
            } catch (error) {
                const status = error.response?.status;
                // Retry on 429 (rate limit) or 502/503 (transient)
                if ((status === 429 || status === 502 || status === 503) && attempt < maxRetries) {
                    const wait = (attempt + 1) * 3000;
                    console.warn(`[OpenRouter] ${status} — retrying in ${wait / 1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                const msg = error.response?.data?.error?.message || error.message;
                console.error(`[OpenRouter] Failed: ${msg}`);
                throw error;
            }
        }
    }
}

module.exports = { OpenRouterService };
