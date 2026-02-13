const { mainPipeline } = require('./skills/generation/pipeline');
const { publishToGhost } = require('./skills/distribution/ghost-publisher');
const { postToX } = require('./skills/distribution/x-distributor');
require('dotenv').config();

async function runFullPipeline(topic) {
    console.log(`🚀 Starting Full Pipeline for topic: ${topic}`);

    // 1. Run Multi-Agent Generation
    const { content, proof } = await mainPipeline(topic);

    if (!content) {
        console.error("Pipeline failed to generate content.");
        return;
    }

    // 2. Publish to Ghost
    const title = `Technical Deep Dive: ${topic}`;
    const post = await publishToGhost(title, content, proof);

    // 3. Post to X
    if (post) {
        const tweetText = `Just published a new technical guide on "${topic}". Verified by EigenAI. 🛡️`;
        await postToX(tweetText, [post.url]);
    }

    console.log("✅ All tasks completed successfully.");
}

// Example usage
const topic = process.argv[2] || "ERC-7702 delegation and its impact on account abstraction";
runFullPipeline(topic);
