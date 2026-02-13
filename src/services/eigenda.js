/**
 * EigenDA Service — Blob Storage via Local Proxy
 * 
 * Reuses the proven pattern from eigen-news-analyst:
 * - POST /put?commitment_mode=standard → store blob, get commitment hash
 * - GET /get/<commitment>?commitment_mode=standard → retrieve stored blob
 */

const axios = require('axios');
require('dotenv').config();

class EigenDAService {
    constructor() {
        this.proxyUrl = process.env.EIGENDA_PROXY_URL || 'http://127.0.0.1:3100';
        this.commitmentMode = process.env.EIGENDA_COMMITMENT_MODE || 'standard';
        this.timeout = parseInt(process.env.EIGENDA_TIMEOUT || '60000', 10);

        this.client = axios.create({
            baseURL: this.proxyUrl,
            timeout: this.timeout,
        });
    }

    /**
     * Store a JSON payload on EigenDA
     * 
     * @param {object} data - The data object to store
     * @returns {Promise<string>} The commitment hash
     */
    async store(data) {
        const payload = JSON.stringify(data);
        console.log(`[EigenDA] Storing blob (${payload.length} bytes)...`);

        try {
            const response = await this.client.post(
                `/put?commitment_mode=${this.commitmentMode}`,
                payload,
                { headers: { 'Content-Type': 'application/json' } }
            );

            const commitment = response.data;
            if (!commitment || typeof commitment !== 'string') {
                throw new Error(`Invalid commitment: ${JSON.stringify(response.data)}`);
            }

            console.log(`[EigenDA] ✅ Stored. Commitment: ${commitment.substring(0, 40)}...`);
            return commitment;
        } catch (error) {
            const msg = this._formatError(error);
            console.error(`[EigenDA] ❌ Store failed: ${msg}`);
            throw new Error(`EigenDA store failed: ${msg}`);
        }
    }

    /**
     * Retrieve a blob from EigenDA by commitment
     * 
     * @param {string} commitment - The commitment hash
     * @returns {Promise<object>} The parsed JSON object
     */
    async retrieve(commitment) {
        console.log(`[EigenDA] Retrieving blob: ${commitment.substring(0, 40)}...`);

        try {
            const response = await this.client.get(
                `/get/${commitment}?commitment_mode=${this.commitmentMode}`
            );

            const payload = response.data;
            if (typeof payload === 'string') {
                return JSON.parse(payload);
            }
            return payload;
        } catch (error) {
            const msg = this._formatError(error);
            console.error(`[EigenDA] ❌ Retrieve failed: ${msg}`);
            throw new Error(`EigenDA retrieve failed: ${msg}`);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health', {
                validateStatus: () => true,
                timeout: 3000
            });
            return response.status === 200 || response.status === 404;
        } catch (error) {
            // Quiet fail - DA is optional if proxy isn't started
            return false;
        }
    }

    _formatError(error) {
        if (axios.isAxiosError(error) && error.response) {
            return `HTTP ${error.response.status}: ${typeof error.response.data === 'string'
                ? error.response.data
                : JSON.stringify(error.response.data)
                }`;
        }
        return error.message || String(error);
    }
}

module.exports = { EigenDAService };
