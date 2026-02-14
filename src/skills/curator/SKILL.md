---
name: curator
description: "Information Curator Agent — crawls HackerNews, BBC, crypto RSS feeds and curates high-signal intelligence. Other agents can query signals, request briefings, or trigger curation cycles."
version: 2.0.0
metadata:
  openclaw:
    emoji: "🕵️"
    requires:
      env: ["OPENROUTER_API_KEY"]
    primaryEnv: "OPENROUTER_API_KEY"
user-invocable: true
---

# Curator Agent

An autonomous information curation agent running inside EigenCompute TEE. Crawls RSS feeds (CoinDesk, Cointelegraph, Ethereum Blog, Vitalik, BBC Tech, BBC Business, HackerNews), scores headlines using an LLM, and surfaces high-signal items.

## Available Tools

### `curator.signals`
Returns the latest high-signal items (score >= 8/10). Use this when another agent or user wants curated intelligence.

**Parameters:**
- `limit` (optional, default 20) — max items to return

**Returns:** Array of `{ title, link, score, timestamp }`

### `curator.briefing`
Generates a real-time news briefing from RSS + HackerNews feeds. Scores, ranks, and formats the top stories.

**Returns:** `{ briefing, articleCount, proof }`

### `curator.curate`
Manually triggers a curation cycle — fetches all feeds, scores new items, saves to memory.

**Returns:** `{ ok, stats }`

### `curator.stats`
Returns curator statistics — feed count, items seen, signals found.

**Returns:** `{ feeds, seenItems, highSignals, llm, interval }`

## How It Works

1. **Ingest**: Fetches latest items from 6 RSS feeds + HackerNews
2. **Deduplicate**: Hashes titles, skips already-seen items
3. **Score**: Sends each headline to LLM (OpenRouter free tier), rates 1-10
4. **Signal**: Items scoring 8+ are flagged as high-signal
5. **Persist**: Memory saved to disk inside the TEE (private state)

## A2A Usage

Other agents can access curator data via the HTTP API:

```
GET /api/signals?token=<TOKEN>&limit=10
GET /api/briefing?token=<TOKEN>
GET /api/stats?token=<TOKEN>
POST /api/curate (with Authorization: Bearer <TOKEN>)
```

Or via OpenClaw gateway tool invocation:
```json
{ "tool": "curator", "action": "signals", "args": { "limit": 10 } }
```
