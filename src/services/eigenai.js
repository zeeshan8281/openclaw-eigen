/**
 * EigenAI Service — Wallet-Signed Grant Authentication
 * 
 * Reuses the proven pattern from eigen-news-analyst:
 * 1. GET /message  → get a challenge message for your wallet
 * 2. Sign with viem → produce a grant signature
 * 3. POST /api/chat/completions → send with grantMessage + grantSignature + walletAddress
 */

const axios = require('axios');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

class EigenAIService {
    constructor() {
        if (!process.env.WALLET_PRIVATE_KEY) {
            console.warn('[EigenAI] ⚠️ WALLET_PRIVATE_KEY is missing. Service will be disabled.');
        }

        if (process.env.WALLET_PRIVATE_KEY) {
            const pk = process.env.WALLET_PRIVATE_KEY.startsWith('0x')
                ? process.env.WALLET_PRIVATE_KEY
                : `0x${process.env.WALLET_PRIVATE_KEY}`;
            this.account = privateKeyToAccount(pk);
        } else {
            this.account = null;
        }

        this.baseUrl = process.env.EIGENAI_API_URL || 'https://determinal-api.eigenarcade.com';
        this.model = process.env.EIGENAI_MODEL || 'gpt-oss-120b-f16';
        this.seed = parseInt(process.env.EIGENAI_SEED || '42', 10);
        this.timeout = parseInt(process.env.EIGENAI_TIMEOUT || '120000', 10);
        this.walletAddress = process.env.WALLET_ADDRESS;
    }

    /**
     * Get a grant challenge message from the API
     */
    async getGrantMessage() {
        console.log(`[EigenAI] Requesting grant message for ${this.walletAddress}`);
        const response = await axios.get(`${this.baseUrl}/message`, {
            params: { address: this.walletAddress },
            timeout: 10000
        });

        if (!response.data.message) {
            throw new Error('No message returned from grant API');
        }
        return response.data.message;
    }

    /**
     * Check grant status and remaining tokens
     */
    async checkGrant() {
        try {
            const response = await axios.get(`${this.baseUrl}/checkGrant`, {
                params: { address: this.walletAddress },
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            console.error('[EigenAI] Grant check failed:', error.message);
            return null;
        }
    }

    /**
     * Send a chat completion request with wallet-signed grant auth
     * 
     * @param {string} systemPrompt - System instructions
     * @param {string} userPrompt - User content
     * @param {number} maxTokens - Max tokens for response
     * @returns {Promise<{content: string, usage: object}>}
     */
    async chatCompletion(systemPrompt, userPrompt, maxTokens = 500) {
        // Step 1: Get grant message
        const grantMessage = await this.getGrantMessage();

        // Step 2: Sign the message with wallet
        console.log('[EigenAI] Signing grant message...');
        const grantSignature = await this.account.signMessage({
            message: grantMessage,
        });

        // Step 3: Send authenticated request
        console.log(`[EigenAI] Sending request to ${this.baseUrl}/api/chat/completions`);
        const response = await axios.post(
            `${this.baseUrl}/api/chat/completions`,
            {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                model: this.model,
                max_tokens: maxTokens,
                temperature: 0,
                seed: this.seed,
                // Custom EigenAI auth fields
                grantMessage,
                grantSignature,
                walletAddress: this.walletAddress
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: this.timeout
            }
        );

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in EigenAI response');
        }

        console.log(`[EigenAI] ✅ Response received (${content.length} chars)`);
        return {
            content,
            usage: response.data?.usage || {},
            model: response.data?.model || this.model
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseUrl}/checkGrant`, {
                params: { address: this.walletAddress },
                timeout: 5000
            });
            const isHealthy = response.data && response.data.success && response.data.hasGrant;
            if (isHealthy) {
                console.log(`[EigenAI] ✅ Healthy. Tokens remaining: ${response.data.tokenCount}`);
            }
            return isHealthy;
        } catch (error) {
            console.error('[EigenAI] ❌ Health check failed:', error.message);
            return false;
        }
    }
}

module.exports = { EigenAIService };
