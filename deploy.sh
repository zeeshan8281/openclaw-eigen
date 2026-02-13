#!/bin/bash
set -e

echo "=== Deploying OpenClaw News Agent to EigenCompute ==="
echo ""

APP_NAME="0x2EDFA14232bde724e2dc7bE958f8e5c00f644410"
ENV_FILE=".env"

# Check auth
echo "[1/3] Checking authentication..."
npx @layr-labs/ecloud-cli auth whoami

echo ""
echo "[2/3] Building & uploading to EigenCompute..."
echo "       This will build the Docker image remotely and upgrade the running app."
echo ""

# Upgrade the existing app with new Dockerfile and env
npx @layr-labs/ecloud-cli compute app upgrade "$APP_NAME" \
    --dockerfile Dockerfile \
    --env-file "$ENV_FILE" \
    --log-visibility public \
    --verbose

echo ""
echo "[3/3] Checking deployment status..."
sleep 5
npx @layr-labs/ecloud-cli compute app info "$APP_NAME"

echo ""
echo "=== Deployment complete ==="
echo "Monitor logs: npx @layr-labs/ecloud-cli compute app logs $APP_NAME"
