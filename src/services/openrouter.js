const axios = require('axios');
require('dotenv').config();

class OpenRouterService {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct:free'; // Default to a free model for testing

        if (!this.apiKey) {
            console.warn('[OpenRouter] ⚠️ OPENROUTER_API_KEY is missing. Service will fail.');
        }
    }

    /**
     * Send a chat completion request to OpenRouter
     * 
     * @param {string} systemPrompt - System instructions
     * @param {string} userPrompt - User content
     * @param {number} maxTokens - Max tokens for response
     * @returns {Promise<{content: string, usage: object}>}
     */
    async chatCompletion(systemPrompt, userPrompt, maxTokens = 500) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');

        console.log(`[OpenRouter] Sending request to ${this.model}...`);

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
                    temperature: 0.1, // Low temp for deterministic curation
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://eigen-openclaw.xyz', // Required by OpenRouter
                        'X-Title': 'Eigen OpenClaw Curator', // Required by OpenRouter
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenRouter response');
            }

            console.log(`[OpenRouter] ✅ Response received (${content.length} chars)`);
            return {
                content,
                usage: response.data?.usage || {},
                model: response.data?.model || this.model
            };
        } catch (error) {
            console.error(`[OpenRouter] Request failed: ${error.response?.data?.error?.message || error.message}`);
            throw error;
        }
    }
}

module.exports = { OpenRouterService };
