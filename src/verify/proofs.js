/**
 * Proof Storage — EigenDA
 * 
 * Stores a cryptographic proof of the news briefing on EigenDA
 * for verifiability. Gracefully degrades if EigenDA is unavailable.
 */

const { EigenDAService } = require('../services/eigenda');
const crypto = require('crypto');

let eigenda = null;

function getEigenDA() {
    if (!eigenda) eigenda = new EigenDAService();
    return eigenda;
}

/**
 * Store a proof of the briefing on EigenDA
 * @param {object} data - { briefing, articles, timestamp, ... }
 * @returns {Promise<{commitment: string|null, hash: string}>}
 */
async function storeProof(data) {
    const payload = {
        type: 'news-briefing',
        version: 1,
        timestamp: new Date().toISOString(),
        contentHash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        ...data
    };

    let commitment = null;
    try {
        const da = getEigenDA();
        const healthy = await da.healthCheck();
        if (healthy) {
            commitment = await da.store(payload);
            console.log(`[Proofs] Stored on EigenDA: ${commitment?.substring(0, 40)}...`);
        } else {
            console.warn('[Proofs] EigenDA not reachable — skipping proof storage');
        }
    } catch (err) {
        console.warn(`[Proofs] EigenDA storage failed (non-fatal): ${err.message}`);
    }

    return {
        commitment,
        hash: payload.contentHash,
        timestamp: payload.timestamp
    };
}

module.exports = { storeProof };
