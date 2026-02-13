const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
});

async function postToX(text, links = []) {
    console.log("--- Posting to X ---");
    try {
        const tweet = await client.v2.tweet(`${text} ${links.join(' ')}`);
        console.log(`Tweet posted: https://x.com/user/status/${tweet.data.id}`);
        return tweet;
    } catch (err) {
        console.error("X Post Error:", err);
    }
}

module.exports = { postToX };
