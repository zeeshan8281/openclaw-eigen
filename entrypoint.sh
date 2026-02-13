#!/bin/bash
echo "=== EigenCompute TEE Startup ==="

# VERY IMPORTANT: Source the environment variables unsealed by the TEE
if [ -f "/usr/local/bin/compute-source-env.sh" ]; then
    echo "[TEE] Unsealing secrets..."
    source /usr/local/bin/compute-source-env.sh
fi

echo "[Debug] Date: $(date -u)"
echo "[Debug] Node Version: $(node --version)"

cd /app

# Run the autonomous script
echo "[Start] Executing node src/autonomous.js..."
exec node src/autonomous.js
