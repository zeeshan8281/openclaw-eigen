# Alfred: Autonomous Intelligence Curator with Agent-to-Agent Payments

An autonomous AI agent running inside an [EigenCompute TEE](https://eigencloud.xyz) (Intel TDX). Crawls RSS feeds, HackerNews, and Twitter/X for crypto, tech, and business news — scores headlines with AI — and sells access to other agents via on-chain Sepolia ETH payments. Every response includes cryptographic TEE attestation proving the curation is untampered.

Built on [OpenClaw](https://openclaw.dev) for agent orchestration, Telegram integration, and A2A protocol support. Accessible via **Telegram** ("Alfred"), **REST API**, **OpenClaw A2A gateway**, and **wallet-gated premium access**.

## What It Does

Alfred runs 24/7 inside a TEE, autonomously curating intelligence:

1. **Crawls** 8 data sources every 4 hours (CoinDesk, Cointelegraph, Ethereum Blog, Vitalik.ca, BBC Tech, BBC Business, HackerNews, Twitter/X)
2. **Scores** each headline 1-10 using an LLM (significance, novelty, relevance to crypto/tech/macro)
3. **Stores** scored signals with timestamps and source attribution
4. **Sells** premium access (signals, briefings) to users and agents via Sepolia ETH payments
5. **Attests** every response with TEE proof (KMS key, config hash, platform metadata)

## Architecture

```
+---------------------------------------------------+
|           EigenCompute TEE (Intel TDX)             |
|                                                    |
|  +------------------+  +----------------------+   |
|  | Curator Service   |  | OpenClaw Gateway     |   |
|  | (port 3001)       |  | (port 3000)          |   |
|  |                   |  |                      |   |
|  | - REST API        |  | - Telegram "Alfred"  |   |
|  | - A2A endpoint    |  | - OpenClaw A2A       |   |
|  | - Payment gate    |  | - Curator skill      |   |
|  | - TEE attestation |  |                      |   |
|  +--------+----------+  +----------+-----------+   |
|           |                        |               |
|     +-----+------------------------+-----+         |
|     |           Curator Engine           |         |
|     |  RSS + Twitter + LLM scoring       |         |
|     |  On-chain payment verification     |         |
|     +------------------------------------+         |
+---------------------------------------------------+
```

## Agent-to-Agent Payment Flow

Other AI agents can discover Alfred, pay for access, and consume intelligence — fully autonomous, no human in the loop.

```
Agent B                                    Alfred (TEE)
  |                                           |
  |  GET /.well-known/agent.json              |
  |------------------------------------------>|
  |  { skills, payment: { recipient, amount }}|
  |<------------------------------------------|
  |                                           |
  |  POST /a2a  { skill: "signals" }          |
  |------------------------------------------>|
  |  { status: "payment-required" }           |
  |<------------------------------------------|
  |                                           |
  |  === Send 0.001 ETH on Sepolia ===        |
  |  (agent's wallet → Alfred's wallet)       |
  |                                           |
  |  POST /a2a  { skill: "signals",           |
  |               txHash: "0xabc..." }        |
  |------------------------------------------>|
  |  { status: "completed",                   |
  |    data: { signals: [...] } }             |
  |<------------------------------------------|
```

### Test the A2A Flow

```bash
# Simulate Agent B (needs a wallet with Sepolia ETH)
AGENT_PRIVATE_KEY=0x... node test-a2a.js
```

The test script runs the full cycle: discover → request → get payment-required → pay on-chain → retry with tx hash → receive signals.

## Data Sources

| Source | Type | Method |
|--------|------|--------|
| CoinDesk | Crypto markets | RSS |
| Cointelegraph | Crypto industry | RSS |
| Ethereum Blog | Protocol updates | RSS |
| Vitalik.ca | Ethereum thought leadership | RSS |
| BBC Technology | Global tech | RSS |
| BBC Business | Global business | RSS |
| HackerNews | Top tech stories | RSS |
| Twitter/X | Crypto/AI tweets | API v2 |

## REST API

Port 3001. Premium endpoints require on-chain payment or token auth. Localhost bypasses auth.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Service health + TEE attestation |
| GET | `/.well-known/agent.json` | None | A2A agent card (capabilities + payment info) |
| POST | `/a2a` | Payment | A2A task endpoint (JSON-RPC) |
| GET | `/api/signals` | Payment | AI-scored news signals |
| GET | `/api/briefing` | Payment | LLM-generated news briefing |
| GET | `/api/stats` | Token | Curator statistics |
| POST | `/api/curate` | Token | Trigger curation cycle |
| GET | `/api/auth/nonce` | None | Get sign-in nonce for wallet auth |
| POST | `/api/auth/verify` | None | Verify wallet signature, get session |
| GET | `/api/auth/status` | Session | Check/verify payment status |

### Payment Authentication

**For agents (A2A):**
```bash
# 1. Discover payment info
curl localhost:3001/.well-known/agent.json

# 2. Request signals (get payment-required)
curl -X POST localhost:3001/a2a \
  -H "Content-Type: application/json" \
  -d '{"method":"tasks/send","params":{"task":{"skill":"signals"}}}'

# 3. After sending ETH, retry with tx hash
curl -X POST localhost:3001/a2a \
  -H "Content-Type: application/json" \
  -d '{"method":"tasks/send","params":{"task":{"skill":"signals","input":{"txHash":"0x..."}}}}'
```

**For users (wallet sign-in):**
```bash
# 1. Get nonce
curl "localhost:3001/api/auth/nonce?address=0xYOUR_WALLET"

# 2. Sign the message with your wallet, then verify
curl -X POST localhost:3001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"address":"0x...","signature":"0x..."}'

# 3. After sending ETH, verify payment
curl "localhost:3001/api/auth/status?txHash=0x..." \
  -H "x-session-token: YOUR_TOKEN"

# 4. Access premium data
curl localhost:3001/api/signals -H "x-session-token: YOUR_TOKEN"
```

## TEE Attestation

Every API response includes cryptographic proof that the curation ran inside a genuine TEE:

```json
{
  "attestation": {
    "appId": "0x92667e...",
    "platform": "Intel TDX (EigenCompute)",
    "configHash": "sha256:...",
    "kmsKeyFingerprint": "sha256:...",
    "imageDigest": "sha256:..."
  }
}
```

## OpenClaw Integration

Alfred uses [OpenClaw](https://openclaw.dev) as the agent framework:

- **Gateway** on port 3000 handles Telegram messaging, agent identity, and A2A protocol
- **Curator skill** (`src/skills/curator/`) exposes curation actions to the OpenClaw A2A registry
- **Config** at `openclaw.json` — model routing (OpenRouter), Telegram channel, tool permissions
- **Agent instructions** in `AGENTS.md` + personality in `SOUL.md` — loaded by OpenClaw at startup

The OpenClaw gateway and the curator service (`autonomous.js`) run as two processes inside the TEE, communicating over localhost.

## Setup

### Environment Variables

```env
# Required
OPENROUTER_API_KEY=sk-or-...
TELEGRAM_BOT_TOKEN=your-bot-token
OPENCLAW_GATEWAY_TOKEN=your-token
WALLET_PRIVATE_KEY=your-private-key
WALLET_ADDRESS=0x...

# Payments (Sepolia)
PAYMENT_WALLET=0x...          # EOA to receive payments
MIN_PAYMENT_ETH=0.001         # Minimum payment amount
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com

# Twitter/X (optional)
X_BEARER_TOKEN=your-bearer-token

# Scoring LLM
OPENROUTER_MODEL=nvidia/nemotron-nano-9b-v2:free
```

### Local Development

```bash
npm install
node src/autonomous.js        # Starts API on port 3001
```

### Deploy to EigenCompute

```bash
docker build --platform linux/amd64 --no-cache -t zeeshan8281/eigen-openclaw:latest .
docker push zeeshan8281/eigen-openclaw:latest
npx @layr-labs/ecloud-cli compute app deploy
```

## Project Structure

```
src/
  autonomous.js              # Express API + A2A endpoint + curation loop
  curator.js                 # RSS/Twitter crawler + LLM headline scoring
  news-cycle.js              # Orchestrator: ingest -> score -> briefing -> proof
  services/
    payments.js              # Wallet auth + on-chain Sepolia payment verification
    openrouter.js            # OpenRouter LLM client (retry on 429/502/503)
    tee-attestation.js       # TEE attestation data collector
    eigenai.js               # EigenAI wallet-signed auth
    eigenda.js               # EigenDA proof storage
  skills/
    curator/                 # OpenClaw A2A skill wrapper
      index.js
      SKILL.md
AGENTS.md                    # Agent behavior + payment flow instructions
SOUL.md                      # Agent identity/personality
test-a2a.js                  # A2A payment flow test script
Dockerfile                   # Production container
entrypoint.sh                # TEE startup script
openclaw.json                # OpenClaw gateway config
```

## Current Deployment

- **App ID:** `0xCfd0A2BEbDD65e8Ed4e8C05f19e0A95cb5de4f2A`
- **Platform:** Intel TDX (EigenCompute)
- **Dashboard:** [verify-sepolia.eigencloud.xyz](https://verify-sepolia.eigencloud.xyz/app/0xCfd0A2BEbDD65e8Ed4e8C05f19e0A95cb5de4f2A)

## License

MIT
