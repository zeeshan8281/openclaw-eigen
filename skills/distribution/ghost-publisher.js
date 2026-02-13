const GhostAdminAPI = require('@tryghost/admin-api');
require('dotenv').config();

const api = new GhostAdminAPI({
    url: process.env.GHOST_URL || 'http://localhost:2368',
    key: process.env.GHOST_ADMIN_API_KEY,
    version: 'v5.0'
});

async function publishToGhost(title, content, proof) {
    console.log(`--- Publishing to Ghost: ${title} ---`);

    // Add verification badge and metadata to the content
    const verifiedHeader = `
        <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ddd;">
            <strong>✅ Verified AI Content</strong><br>
            <small>This article was generated and verified cryptographically via EigenAI.</small><br>
            <small><strong>Proof Hash:</strong> ${proof?.response_hash || 'N/A'}</small><br>
            <small><strong>EigenDA Blob:</strong> <a href="https://blobs-sepolia.eigenda.xyz/blobs/${proof?.eigenda_blob_id}">${proof?.eigenda_blob_id || 'N/A'}</a></small>
        </div>
    `;

    try {
        const post = await api.posts.add({
            title: title,
            html: verifiedHeader + content,
            status: 'draft' // Start as draft for final human review
        });
        console.log(`Post created: ${post.url}`);
        return post;
    } catch (err) {
        console.error("Ghost Publish Error:", err);
    }
}

module.exports = { publishToGhost };
