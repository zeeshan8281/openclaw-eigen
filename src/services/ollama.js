/**
 * Ollama Service — Local LLM for Research & Drafting
 * 
 * Handles all the "free" inference:
 * - SEO research
 * - Article drafting
 * - Brief generation
 * 
 * Only the final verification pass goes through EigenAI.
 */

const axios = require('axios');
require('dotenv').config();

class OllamaService {
    constructor() {
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || 'qwen3:32b';
    }

    /**
     * Generate text using the local Ollama instance
     * 
     * @param {string} prompt - The full prompt
     * @param {object} options - Optional overrides
     * @returns {Promise<string>} Generated text
     */
    async generate(prompt, options = {}) {
        const model = options.model || this.model;
        console.log(`[Ollama] Generating with ${model}...`);

        try {
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model,
                prompt,
                stream: false,
                options: {
                    temperature: options.temperature || 0.7,
                    num_predict: options.maxTokens || 4096,
                }
            }, {
                timeout: options.timeout || 300000 // 5 min for long-form generation
            });

            const text = response.data.response;
            console.log(`[Ollama] ✅ Generated ${text.length} chars (${response.data.eval_count || '?'} tokens)`);
            return text;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama is not running. Start it with: ollama serve');
            }
            throw new Error(`Ollama generation failed: ${error.message}`);
        }
    }

    /**
     * Chat-style generation (multi-turn)
     */
    async chat(messages, options = {}) {
        const model = options.model || this.model;
        console.log(`[Ollama] Chat with ${model} (${messages.length} messages)...`);

        try {
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                model,
                messages,
                stream: false,
                options: {
                    temperature: options.temperature || 0.7,
                    num_predict: options.maxTokens || 4096,
                }
            }, {
                timeout: options.timeout || 300000
            });

            const content = response.data.message.content;
            console.log(`[Ollama] ✅ Chat response: ${content.length} chars`);
            return content;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama is not running. Start it with: ollama serve');
            }
            throw new Error(`Ollama chat failed: ${error.message}`);
        }
    }

    /**
     * List available local models
     */
    async listModels() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`);
            return response.data.models || [];
        } catch (error) {
            console.error('[Ollama] Failed to list models:', error.message);
            return [];
        }
    }

    /**
     * Health check — is Ollama running?
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
            const models = response.data.models || [];
            return models.length > 0;
        } catch (error) {
            // Quiet fail - EigenAI is the main service
            return false;
        }
    }
}

module.exports = { OllamaService };
