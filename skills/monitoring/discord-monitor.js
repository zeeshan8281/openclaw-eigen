const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const TARGET_CHANNELS = [
    'solana-dev-general',
    'ethereum-dev-chat',
    'eigenlayer-builders'
];

client.once('ready', () => {
    console.log(`Discord Monitor logged in as ${client.user.tag}`);
});

client.on('messageCreate', message => {
    if (TARGET_CHANNELS.includes(message.channel.name)) {
        // Collect messages and detect trends
        // For simplicity, we log it for OpenClaw to process
        console.log(`[TREND] ${message.channel.name}: ${message.content}`);
    }
});

if (process.env.OPENCLAW_DISCORD_TOKEN) {
    client.login(process.env.OPENCLAW_DISCORD_TOKEN);
} else {
    console.error("No Discord token found in environment.");
}
