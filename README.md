# OpenCLAW-Eigen: Information Curator Agent

An autonomous information curation agent running inside an [EigenCompute TEE](https://eigencloud.xyz) (Trusted Execution Environment). Crawls RSS feeds from crypto, tech, and business sources, scores headlines using an LLM, and surfaces high-signal intelligence — all accessible via Telegram, REST API, and OpenClaw A2A gateway.

## Architecture

```
+-------------------------------------------+
|          EigenCompute TEE Container        |
|                                           |
|  +----------------+  +----------------+  |
|  | Autonomous Agent|  | OpenClaw       |  |
|  | (port 3001)     |  | Gateway        |  |
|  |                 |  | (port 3000)    |  |
|  | - Telegram Bot  |  |                |  |
|  | - REST API      |  | - A2A Protocol |  |
|  | - Curator Loop  |  | - Curator Skill|  |
|  +-------+--------+  +-------+--------+  |
|          |                    |            |
|          +--------+-----------+            |
|                   |                        |
|            +------+------+                 |
|            |   Curator   |                 |
|            | RSS + LLM   |                 |
|            +-------------+                 |
+-------------------------------------------+
```

**Two processes run side-by-side:**

| Process | Port | Purpose |
|---------|------|---------|
| `autonomous.js` | 3001 | Telegram bot ("Alfred"), REST API, background curation loop |
| OpenClaw Gateway | 3000 | A2A discovery, tool invocation, Control UI |

## Data Sources

- **CoinDesk** — Crypto market news
- **Cointelegraph** — Crypto industry coverage
- **Ethereum Blog** — Protocol updates
- **Vitalik.ca** — Ethereum thought leadership
- **BBC Technology** — Global tech news
- **BBC Business** — Global business news
- **HackerNews** — Top tech stories

## How It Works

1. **Ingest** — Fetches latest items from 6 RSS feeds + HackerNews
2. **Deduplicate** — Hashes titles, skips already-seen items
3. **Score** — Sends each headline to an LLM (OpenRouter free tier), rates 1-10
4. **Signal** — Items scoring 8+ are flagged as high-signal intelligence
5. **Persist** — Memory saved to disk inside the TEE (private state)
6. **Notify** — Background loop sends Telegram alerts for new signals

## Setup

### Prerequisites

- Node.js 22+
- Docker
- An [EigenCompute](https://eigencloud.xyz) account (for TEE deployment)

### Environment Variables

Create a `.env` file:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=             # auto-detected on first /start

# OpenRouter (free tier LLM for scoring)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=nvidia/nemotron-nano-9b-v2:free

# Wallet (EigenAI grant auth)
WALLET_PRIVATE_KEY=your-private-key
WALLET_ADDRESS=0x...

# EigenDA (optional, for on-chain proofs)
EIGENDA_PROXY_URL=http://127.0.0.1:3100

# OpenClaw Gateway
OPENCLAW_GATEWAY_TOKEN=your-token

# Curation interval (default: 4 hours)
CRON_INTERVAL=14400000
```

### Local Development

```bash
npm install
node src/autonomous.js
```

### Docker

```bash
docker build -t eigen-openclaw .
docker run --env-file .env -p 3000:3000 -p 3001:3001 eigen-openclaw
```

### Deploy to EigenCompute TEE

```bash
# Authenticate
npx @layr-labs/ecloud-cli auth whoami

# Build for amd64 and push
docker buildx build --platform linux/amd64 -t ghcr.io/<user>/eigen-openclaw:latest --push .

# Deploy new app
npx @layr-labs/ecloud-cli compute app deploy

# Upgrade existing app
npx @layr-labs/ecloud-cli compute app upgrade <APP_ID> \
    --image-ref ghcr.io/<user>/eigen-openclaw:latest \
    --env-file .env \
    --log-visibility public
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot, auto-detect chat ID |
| `/news` | Generate a real-time news briefing |
| `/curate` | Trigger an RSS curation cycle |
| `/signals` | View latest high-signal items |
| `/whoami` | Show your chat ID |
| `/help` | List available commands |

You can also send any free-text message to chat with Alfred (powered by OpenRouter LLM).

## REST API

All endpoints on port 3001. Authenticated endpoints require `?token=<TOKEN>` or `Authorization: Bearer <TOKEN>`.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Service health + uptime |
| GET | `/api/signals` | Yes | High-signal items (query: `limit`) |
| GET | `/api/briefing` | Yes | Generate news briefing |
| GET | `/api/stats` | Yes | Curator statistics |
| POST | `/api/curate` | Yes | Trigger curation cycle |

## OpenClaw A2A

The OpenClaw gateway on port 3000 exposes the curator as a skill that other agents can invoke:

```json
{ "tool": "curator", "action": "signals", "args": { "limit": 10 } }
{ "tool": "curator", "action": "briefing" }
{ "tool": "curator", "action": "curate" }
{ "tool": "curator", "action": "stats" }
```

## Project Structure

```
src/
  autonomous.js          # Main entry — Telegram bot + Express API + curation loop
  curator.js             # RSS feed crawler + LLM scoring engine
  news-cycle.js          # News cycle orchestrator (ingest → score → briefing → proof)
  services/
    openrouter.js        # OpenRouter LLM client with retry logic
    eigenai.js           # EigenAI API client (wallet-signed grants)
    eigenda.js           # EigenDA proof storage
    ollama.js            # Local Ollama client (optional)
  skills/
    curator/             # OpenClaw A2A skill wrapper
      index.js           # Skill entry point (invoke + register)
      SKILL.md           # Skill metadata and documentation
      package.json
  ingest/                # RSS + HackerNews aggregators
  filter/                # Headline scoring logic
  summarize/             # Briefing generation
  verify/                # EigenDA proof storage
Dockerfile               # Production container (Node 22 + OpenClaw)
entrypoint.sh            # Runs autonomous agent + OpenClaw gateway
openclaw.json            # Gateway configuration
deploy.sh                # EigenCompute deployment script
```

## License

MIT
