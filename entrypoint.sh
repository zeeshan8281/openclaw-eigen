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

# 1. Launch the autonomous agent (Telegram bot + Express API) in background
echo "[Start] Launching autonomous agent..."
node src/autonomous.js &
AGENT_PID=$!

# 2. Launch OpenClaw gateway in foreground (A2A discovery on port 3000)
echo "[Start] Launching OpenClaw gateway on port 3000..."
npx openclaw gateway --allow-unconfigured --bind lan --verbose &
GATEWAY_PID=$!

# Wait for either process to exit — if one dies, kill the other
wait -n $AGENT_PID $GATEWAY_PID
EXIT_CODE=$?
echo "[Entrypoint] A process exited with code $EXIT_CODE. Shutting down..."
kill $AGENT_PID $GATEWAY_PID 2>/dev/null
exit $EXIT_CODE
