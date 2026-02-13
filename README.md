# Verifiable Content Generation Pipeline ($0 Local Build)

This project implements an autonomous content pipeline that monitors trends, generates technical articles using local LLMs (Ollama), cryptographically verifies them via EigenAI, and publishes to a self-hosted Ghost blog and X.

## 🛠 Prerequisites

1.  **Node.js 20+**
2.  **Docker & Docker Compose**
3.  **Ollama**: Install from [ollama.ai](https://ollama.ai) and run:
    ```bash
    ollama pull qwen3:32b
    ```
4.  **EigenAI API Key**: Connect your X account at [deTERMinal](https://terminal.eigencloud.xyz) to get 1M free tokens.

## 🚀 Setup

1.  **Clone/Initialize**:
    ```bash
    cd /Users/zeeshan/Downloads/eigen-openclaw
    npm install
    ```

2.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your keys.
    ```bash
    cp .env.example .env
    ```

3.  **Start Ghost CMS**:
    ```bash
    docker-compose up -d
    ```
    Your blog will be available at `http://localhost:2368`. Admin portal at `http://localhost:2368/ghost`.

4.  **OpenClaw Integration**:
    Install OpenClaw globally:
    ```bash
    npm install -g openclaw
    openclaw onboard
    ```
    Configure your `~/.openclaw/openclaw.json` to use local Ollama.

## 📈 Running the Pipeline

You can run the full pipeline manually:
```bash
node index.js "The rise of AI agents in DeFi"
```

The system will:
1.  **Research** using Ollama (qwen3:32b).
2.  **Draft** using Ollama (qwen3:32b).
3.  **Verify & Polish** using EigenAI (gpt-oss-120b-f16).
4.  **Publish** a draft to your local Ghost CMS.
5.  **Post** a notification to X.

## 🛡️ Verification Proofs
Each post includes metadata from EigenAI:
- `model_digest`: Proves which model generated the content.
- `eigenda_blob_id`: Permanent on-chain proof of the generation.
- `response_hash`: Tamper-evident hash of the content.

## 📁 Project Structure
- `skills/monitoring/`: Trend detection via browser scraping and Discord bots.
- `skills/generation/`: Multi-agent drafting and EigenAI verification logic.
- `skills/distribution/`: Ghost and X publishing integration.
- `docker-compose.yml`: Self-hosted infrastructure.
