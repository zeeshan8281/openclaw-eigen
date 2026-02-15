#!/bin/bash
echo "=== EigenCompute TEE Startup ==="

# Source the environment variables unsealed by the TEE
if [ -f "/usr/local/bin/compute-source-env.sh" ]; then
    echo "[TEE] Unsealing secrets..."
    source /usr/local/bin/compute-source-env.sh
fi

echo "[Debug] Date: $(date -u)"
echo "[Debug] Node: $(node --version)"
echo "[Debug] OpenClaw: $(npx openclaw --version 2>/dev/null || echo 'not found')"

cd /app

# Inject secrets into OpenClaw config at runtime
echo "[Config] Injecting runtime secrets into OpenClaw config..."
node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));

    // Inject OpenRouter API key
    if (process.env.OPENROUTER_API_KEY) {
        if (cfg.models && cfg.models.providers && cfg.models.providers.openrouter) {
            cfg.models.providers.openrouter.apiKey = process.env.OPENROUTER_API_KEY;
            console.log('[Config] Injected OpenRouter API key');
        }
    }

    // Inject Telegram bot token
    if (process.env.TELEGRAM_BOT_TOKEN) {
        if (cfg.channels && cfg.channels.telegram) {
            cfg.channels.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
            console.log('[Config] Injected Telegram bot token');
        }
    }

    fs.writeFileSync('/root/.openclaw/openclaw.json', JSON.stringify(cfg, null, 2));
"

# Ensure gateway token is exported for both processes
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-eigen123}"

# 1. Launch the autonomous agent (Express API + curator loop) in background
echo "[Start] Launching curator API on port 3001..."
node src/autonomous.js &
AGENT_PID=$!

# 2. Launch OpenClaw gateway (agent + Telegram + A2A on port 3000)
echo "[Start] Launching OpenClaw gateway on port 3000..."
npx openclaw gateway --allow-unconfigured --bind lan --verbose &
GATEWAY_PID=$!

# Wait for either process to exit — if one dies, kill the other
wait -n $AGENT_PID $GATEWAY_PID
EXIT_CODE=$?
echo "[Entrypoint] A process exited with code $EXIT_CODE. Shutting down..."
kill $AGENT_PID $GATEWAY_PID 2>/dev/null
exit $EXIT_CODE
