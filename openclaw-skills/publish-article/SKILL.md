---
name: publish-article
description: Publish a generated article to Ghost CMS, X (Twitter), and Discord
---

# Publish Article Skill

This skill publishes a verified article from the pipeline output to one or more distribution channels.

## When to use this skill

Use this skill when the user asks you to:
- Publish an article
- Post to Ghost / blog
- Share on Twitter / X
- Distribute content

## Prerequisites

Check which services are configured by reading the `.env` file at `/Users/zeeshan/Downloads/eigen-openclaw/.env`:

- **Ghost CMS**: Requires `GHOST_ADMIN_API_KEY` to be set. Ghost must be running via Docker (`docker compose up -d` in the project root).
- **X/Twitter**: Requires `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` to be set.
- **Discord**: Requires `DISCORD_BOT_TOKEN` to be set.

## How to publish

### Step 1: Identify the article

Ask the user which article to publish. If they just ran the pipeline, use the most recent output folder:

```bash
ls -t /Users/zeeshan/Downloads/eigen-openclaw/output/ | head -1
```

Read the article from `3-final-article.md` in that folder.
Read the proof from `4-proof.json` in that folder.

### Step 2: Publish to Ghost CMS

If Ghost is configured and running:

```bash
node /Users/zeeshan/Downloads/eigen-openclaw/skills/distribution/ghost-publisher.js
```

Or use the Ghost Admin API directly:
- URL: Value of `GHOST_URL` from .env (default: `http://localhost:2368`)
- Create a POST to the Ghost Admin API with the article content
- Include the "Verified by EigenAI" badge from the proof metadata
- Set status to "draft" so the user can review before making it live

### Step 3: Publish to X/Twitter

If X API keys are configured:

1. Create a thread from the article:
   - Tweet 1: Hook + article link
   - Tweet 2-4: Key takeaways (3 bullet points per tweet)
   - Tweet 5: "This article was verified by EigenAI. Proof: [EigenDA link]"

2. Use the X distribution script:
```bash
node /Users/zeeshan/Downloads/eigen-openclaw/skills/distribution/x-distributor.js
```

Remember: Free tier limit is 500 posts/month (~16/day).

### Step 4: Post to Discord

If Discord bot is configured:
- Share the article link + a brief summary in relevant channels
- Include the verification proof link

### Step 5: Log to Notion (optional)

If Notion API key is configured, log the article metadata:
- Topic, word count, publication date
- Ghost URL, X thread URL
- EigenDA commitment proof
- Token usage

## After publishing

Report back to the user with:
- Links to where the article was published
- Any channels that were skipped (due to missing API keys)
- Remaining EigenAI token budget
