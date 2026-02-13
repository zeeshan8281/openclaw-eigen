#!/bin/bash
echo "--- SYSTEM INFO ---"
npx openclaw --version
node -v
echo "-------------------"

echo "[Start] Launching Autonomous Agent (Curator) in background..."
node src/autonomous.js > agent.log 2>&1 &
# Tail the agent log so it appears in TEE logs
tail -n 20 -f agent.log &

echo "[Start] Launching OpenClaw Gateway in foreground..."
npx openclaw gateway --allow-unconfigured --bind lan --verbose
