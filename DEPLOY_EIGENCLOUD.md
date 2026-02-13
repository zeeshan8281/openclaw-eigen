# Deploying to EigenCloud (TEE Compute)

EigenCloud allows you to run your OpenClaw agent inside a verifiable Trusted Execution Environment (TEE).

## Prerequisites
1.  **Docker**: Ensure Docker is running.
2.  **Node.js**: Ensure Node.js is installed.
3.  **EigenCloud Account**: You need an account/credits.

## Step 1: Install the EigenCloud CLI
```bash
npm install -g @layr-labs/ecloud-cli
```

## Step 2: Authenticate
Login with your private key (or generate a new one):
```bash
ecloud auth login
# OR
ecloud auth generate --store
```

## Step 3: Deploy the Agent
Run this command from the project root. The CLI will detect the `Dockerfile` and build it remotely or locally.

```bash
ecloud compute app deploy
```
- Select **"Build and deploy from Dockerfile"** when prompted.
- Choose **Linux/AMD64** (Standard TEE architecture).

## Step 4: Configuration
You may need to set environment variables for the TEE instance:
```bash
ecloud compute app env set \
  OLLAMA_BASE_URL="http://localhost:11434" \
  OPENAI_API_KEY="ollama"
```
*(Note: If the TEE doesn't support running Ollama inside the same container, you might need to deploy Ollama as a separate service or use a remote model provider).*

## Step 5: Check Status
```bash
ecloud compute app info
ecloud compute app logs
```

## Troubleshooting
- **Ollama in TEE**: Running large models inside a TEE can be slow without GPU acceleration. Ensure your instance type supports it.
- **Networking**: If your agent needs to talk to the internet (e.g., Ghost CMS), ensure egress rules allow it.
