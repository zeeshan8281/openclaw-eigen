# OpenCLAW-Eigen: Autonomous Information Curator in a TEE

An autonomous AI agent running inside an [EigenCompute TEE](https://eigencloud.xyz) (Intel TDX). Crawls RSS feeds from crypto, tech, and business sources, scores headlines using an LLM, and surfaces high-signal intelligence with cryptographic attestation — proving every curation happened in a trusted enclave.

Accessible via **Telegram** (as "Alfred"), **REST API**, and **OpenClaw A2A gateway**.

## Architecture

```
+------------------------------------------------+
|          EigenCompute TEE (Intel TDX)          |
|                                                |
|  +-----------------+  +--------------------+   |
|  | Curator Service  |  | OpenClaw Gateway   |   |
|  | (port 3001)      |  | (port 3000)        |   |
|  |                  |  |                    |   |
|  | - REST API       |  | - Telegram "Alfred"|   |
|  | - Curation Loop  |  | - A2A Protocol     |   |
|  | - TEE Attestation|  | - Curator Skill    |   |
|  +--------+---------+  +---------+----------+   |
|           |                      |               |
|           +----------+-----------+               |
|                      |                           |
|              +-------+--------+                  |
|              |    Curator     |                  |
|              | RSS + LLM     |                  |
|              | Score + Store  |                  |
|              +----------------+                  |
+------------------------------------------------+
```

| Process | Port | Purpose |
|---------|------|---------|
| `autonomous.js` | 3001 | REST API, background curation loop, TEE attestation |
| OpenClaw Gateway | 3000 | Telegram bot ("Alfred"), A2A discovery, Control UI |

## Data Sources

| Source | Type |
|--------|------|
| CoinDesk | Crypto market news |
| Cointelegraph | Crypto industry |
| Ethereum Blog | Protocol updates |
| Vitalik.ca | Ethereum thought leadership |
| BBC Technology | Global tech |
| BBC Business | Global business |
| HackerNews | Top tech stories |

## How It Works

1. **Ingest** — Fetches latest items from 6 RSS feeds + HackerNews
2. **Deduplicate** — Hashes titles, skips already-seen items
3. **Score** — Sends each headline to an LLM (OpenRouter), rates 1-10
4. **Signal** — Items scoring 8+ are flagged as high-signal intelligence
5. **Attest** — Every API response includes TEE attestation (KMS key fingerprint, config hash, platform proof)
6. **Prove** — Briefings are stored on EigenDA with TEE context for on-chain verifiability

## TEE Attestation

Every API response includes an `attestation` object proving the curation ran inside a real TEE:

```json
{
  "attestation": {
    "appId": "0x6e6136...",
    "platform": "Intel TDX (EigenCompute)",
    "configHash": "sha256:...",
    "kmsKeyFingerprint": "sha256:...",
    "imageDigest": "sha256:...",
    "nodeVersion": "v22.22.0",
    "uptimeSeconds": 3600
  }
}
```

- **configHash** — SHA-256 of workspace config files (AGENTS.md, SOUL.md, openclaw.json), proving config integrity
- **kmsKeyFingerprint** — Hash of the TEE's KMS signing public key, proving it's a real EigenCompute enclave
- **imageDigest** — Docker image hash, proving which code is running

## REST API

All endpoints on port 3001. External requests require `?token=<TOKEN>` or `Authorization: Bearer <TOKEN>`. Localhost requests (from OpenClaw gateway) bypass auth.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Service health, uptime, attestation |
| GET | `/api/signals` | Yes | High-signal items (query: `limit`) |
| GET | `/api/briefing` | Yes | Generate LLM news briefing |
| GET | `/api/stats` | Yes | Curator statistics |
| POST | `/api/curate` | Yes | Trigger curation cycle |

## Telegram (Alfred)

Send any message to Alfred on Telegram. Ask for news, signals, briefings, or just chat. Built-in commands:

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot, auto-detect chat ID |
| `/news` | Real-time news briefing |
| `/curate` | Trigger RSS curation cycle |
| `/signals` | Latest high-signal items |

## OpenClaw A2A

The gateway on port 3000 exposes the curator as a skill for agent-to-agent communication:

```json
{ "tool": "curator", "action": "signals", "args": { "limit": 10 } }
{ "tool": "curator", "action": "briefing" }
{ "tool": "curator", "action": "curate" }
{ "tool": "curator", "action": "stats" }
```

## Setup

### Environment Variables

```env
TELEGRAM_BOT_TOKEN=your-bot-token
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=nvidia/nemotron-nano-9b-v2:free
OPENCLAW_GATEWAY_TOKEN=your-token
WALLET_PRIVATE_KEY=your-private-key
WALLET_ADDRESS=0x...
CRON_INTERVAL=14400000
```

### Local Development

```bash
npm install
node src/autonomous.js
```

### Deploy to EigenCompute

```bash
# Build for amd64 (TEE target)
docker build --platform linux/amd64 -t youruser/eigen-openclaw:latest .
docker push youruser/eigen-openclaw:latest

# Deploy (interactive prompts)
npx @layr-labs/ecloud-cli compute app deploy
```

## Project Structure

```
src/
  autonomous.js              # Entry point — Express API + curation loop
  curator.js                 # RSS crawler + LLM headline scoring
  news-cycle.js              # Orchestrator: ingest → score → briefing → proof
  services/
    openrouter.js            # OpenRouter LLM client (retry on 429/502/503)
    tee-attestation.js       # TEE attestation data collector (cached at startup)
    eigenai.js               # EigenAI wallet-signed auth
    eigenda.js               # EigenDA proof storage
  ingest/
    aggregator.js            # RSS feed aggregator
    rss.js                   # RSS parser
    hn.js                    # HackerNews client
  filter/
    scorer.js                # LLM headline scoring (1-10)
  summarize/
    briefing.js              # LLM briefing generation
  verify/
    proofs.js                # EigenDA proof storage + TEE attestation
  skills/
    curator/                 # OpenClaw A2A skill wrapper
      index.js
      SKILL.md
      package.json
AGENTS.md                    # Agent behavior instructions
SOUL.md                      # Agent identity/personality
Dockerfile                   # Production container (Node 22 + OpenClaw)
entrypoint.sh                # TEE startup: unseal secrets, run both processes
openclaw.json                # OpenClaw gateway config
EIGENCOMPUTE-DX-FEEDBACK.md  # Developer experience feedback for EigenCompute
```

## Current Deployment

- **App ID:** `0x6e6136bd0FCfaa87E59aAb04110854Ff5e8E7961`
- **Platform:** Intel TDX (EigenCompute)
- **Dashboard:** [verify-sepolia.eigencloud.xyz](https://verify-sepolia.eigencloud.xyz/app/0x6e6136bd0FCfaa87E59aAb04110854Ff5e8E7961)

## License

MIT
