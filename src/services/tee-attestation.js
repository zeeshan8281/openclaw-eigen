/**
 * TEE Attestation — Collects Intel TDX attestation data at startup.
 *
 * All data is gathered once and cached (attestation is static per deployment).
 * Outside a TEE, fields gracefully fall back to null.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let cachedAttestation = null;

/** Read a file and return its contents, or null on failure. */
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

/** SHA-256 hex digest of a string. */
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash key workspace config files to prove config integrity.
 * Checks both local dev paths and TEE container paths.
 */
function computeConfigHash() {
    const candidates = [
        // TEE container paths
        '/root/.openclaw/workspace/AGENTS.md',
        '/root/.openclaw/workspace/SOUL.md',
        '/root/.openclaw/openclaw.json',
        // Local dev paths (relative to project root)
        path.resolve(__dirname, '../../AGENTS.md'),
        path.resolve(__dirname, '../../SOUL.md'),
        path.resolve(__dirname, '../../openclaw.json'),
    ];

    const contents = [];
    const resolved = [];
    for (const p of candidates) {
        const data = safeReadFile(p);
        if (data !== null) {
            contents.push(data);
            resolved.push(p);
        }
    }

    if (contents.length === 0) return { hash: null, files: [] };
    return {
        hash: 'sha256:' + sha256(contents.join('\n')),
        files: resolved
    };
}

/** Read the KMS signing public key fingerprint if available. */
function getKmsKeyFingerprint() {
    const keyPath = '/usr/local/bin/kms-signing-public-key.pem';
    const pem = safeReadFile(keyPath);
    if (!pem) return null;
    return 'sha256:' + sha256(pem.trim());
}

/** Attempt to read the Docker image digest from common locations. */
function getImageDigest() {
    // 1. Explicit env var (set in Dockerfile or deploy script)
    if (process.env.IMAGE_DIGEST) return process.env.IMAGE_DIGEST;

    // 2. Docker Desktop injects this
    if (process.env.HOSTNAME) {
        const dockerEnv = safeReadFile('/proc/self/cgroup');
        if (dockerEnv) {
            const match = dockerEnv.match(/docker[/-]([a-f0-9]{64})/);
            if (match) return 'container:' + match[1].substring(0, 12);
        }
    }

    return null;
}

/**
 * Collect all attestation data. Called once at startup.
 * @returns {object} attestation object
 */
function collectAttestation() {
    const configResult = computeConfigHash();

    return {
        appId: process.env.ECLOUD_APP_ID || null,
        platform: 'Intel TDX (EigenCompute)',
        imageDigest: getImageDigest(),
        configHash: configResult.hash,
        configFiles: configResult.files,
        kmsKeyFingerprint: getKmsKeyFingerprint(),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime())
    };
}

/**
 * Get the cached attestation object (initializes on first call).
 * @returns {object} attestation data
 */
function getAttestation() {
    if (!cachedAttestation) {
        cachedAttestation = collectAttestation();
        console.log('[TEE] Attestation collected:', JSON.stringify({
            appId: cachedAttestation.appId,
            configHash: cachedAttestation.configHash,
            kmsKey: cachedAttestation.kmsKeyFingerprint ? 'present' : 'absent'
        }));
    }
    return {
        ...cachedAttestation,
        uptimeSeconds: Math.floor(process.uptime())
    };
}

module.exports = { getAttestation };
