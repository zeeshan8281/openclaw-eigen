#!/bin/bash
echo "=== EigenCompute TEE Startup ==="

# Source the environment variables unsealed by the TEE
if [ -f "/usr/local/bin/compute-source-env.sh" ]; then
    echo "[TEE] Unsealing secrets..."
    source /usr/local/bin/compute-source-env.sh
fi

echo "[Debug] Date: $(date -u)"
echo "[Debug] Node Version: $(node --version)"

# Keep alive loop to prevent immediate exit
echo "[Process] Entering keep-alive loop..."
while true; do
    echo "Heartbeat: $(date -u)"
    sleep 30
done
