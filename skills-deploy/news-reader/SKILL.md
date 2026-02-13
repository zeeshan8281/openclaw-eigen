---
name: news-reader
description: Fetch, rank, and summarize the latest crypto/tech news into a Telegram-friendly briefing
---

# News Reader Skill

This skill runs a full news cycle: fetches RSS feeds + Hacker News, scores articles by relevance, summarizes the top stories via EigenAI, and optionally stores a proof on EigenDA.

## When to use this skill

Use this skill when the user asks you to:
- Get the latest news / news briefing
- What's happening in crypto / tech / markets
- Run the news cycle
- Give me a news update
- Or on the 4-hour scheduled cron trigger

## How to run

1. Run the news cycle script:
```bash
node /Users/zeeshan/Downloads/eigen-openclaw/src/news-cycle.js
```

2. The script will:
   - **Ingest** articles from 6 RSS feeds (CoinDesk, Blockworks, Decrypt, The Block, CoinTelegraph, TechCrunch) and Hacker News top stories
   - **Score** articles using keyword relevance, source credibility, and recency
   - **Summarize** the top 10 articles into a Telegram-friendly briefing via EigenAI
   - **Store** a cryptographic proof on EigenDA (if available)

3. The script outputs the briefing text to stdout. Read the output and share it with the user.

4. If the script fails or returns "No notable news", let the user know.

## Scheduled delivery

This skill is triggered automatically every 4 hours by the OpenClaw cron. When triggered by cron, simply run the script and deliver the output.

## Manual trigger

The user can also ask for news at any time by saying "news", "briefing", "what's happening", etc.

## Prerequisites

- **EigenAI Proxy** must be running on port 3002 (handles wallet auth transparently)
- **Node.js** and dependencies must be installed
- **Internet access** for RSS/HN fetching

## Token Budget

Each briefing uses approximately 1,500-2,000 EigenAI tokens. With ~900K tokens remaining, that's ~450-600 briefings (75-100 days at 4h intervals).
