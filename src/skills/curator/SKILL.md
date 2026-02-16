---
name: curator
description: "Information Curator — crawls crypto, tech, Twitter, and business RSS feeds, scores headlines with AI, and surfaces high-signal intelligence. Premium access via on-chain Sepolia ETH payments."
version: 3.0.0
metadata:
  openclaw:
    emoji: "🕵️"
user-invocable: true
---

# Curator Skill

Curator service runs locally on port 3001. Use the exec tool to call it.

## Get Signals (scored news items)

```json
{"command": "curl -s http://localhost:3001/api/signals?limit=10"}
```

## Get News Briefing

```json
{"command": "curl -s http://localhost:3001/api/briefing"}
```

## Get Stats

```json
{"command": "curl -s http://localhost:3001/api/stats"}
```

## Trigger Curation Cycle

```json
{"command": "curl -s -X POST http://localhost:3001/api/curate"}
```

## Check Health

```json
{"command": "curl -s http://localhost:3001/health"}
```

## A2A Discovery

```json
{"command": "curl -s http://localhost:3001/.well-known/agent.json"}
```

## Verify Payment (tx hash)

```json
{"command": "curl -s 'http://localhost:3001/api/auth/status?txHash=TX_HASH_HERE' -H 'x-session-token: TOKEN'"}
```

## Response Rules

- Format signals with **bold titles**, scores, source names, and links
- Use bullet points, never tables
- Mention how many items were found
- If asked to expand on a story: use what you know, add analysis, never scrape URLs
- If a user hasn't paid, explain the payment flow: send 0.001 Sepolia ETH, then share the tx hash
