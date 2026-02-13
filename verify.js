const axios = require('axios');

async function verifyProof(blobId) {
    console.log(`--- Verifying EigenDA Blob: ${blobId} ---`);
    const explorerUrl = `https://blobs-sepolia.eigenda.xyz/blobs/${blobId}`;

    try {
        console.log(`You can verify the raw data at: ${explorerUrl}`);
        // Optionally fetch and hash locally to compare
    } catch (err) {
        console.error("Verification Error:", err);
    }
}

const blobId = process.argv[2];
if (blobId) verifyProof(blobId);
else console.log("Usage: node verify.js <blobId>");
