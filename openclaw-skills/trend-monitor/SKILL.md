---
name: trend-monitor
description: Monitor trending topics across X (Twitter) and Discord communities for content ideas
---

# Trend Monitor Skill

This skill monitors X (Twitter) and developer Discord communities to identify trending topics that would make good technical articles.

## When to use this skill

Use this skill when the user asks you to:
- Find trending topics
- Check what's hot in crypto/dev communities
- Suggest article ideas
- Monitor social channels

## How to monitor X (Twitter)

Since we use the free X API tier (write-only, no read access), use browser automation to scrape trending topics:

1. Open a browser and navigate to X search with relevant queries:
   - `https://x.com/search?q=solana%20developer&f=top`
   - `https://x.com/search?q=ethereum%20EIP&f=top`
   - `https://x.com/search?q=eigenlayer%20avs&f=top`
   - `https://x.com/search?q=account%20abstraction&f=top`
   - `https://x.com/search?q=AI%20agents%20crypto&f=top`

2. Extract the top 5-10 posts from each query, noting:
   - Post content/text
   - Engagement (likes, retweets, replies)
   - Author and their follower count
   - Timestamp

3. Analyze the extracted data to identify:
   - **Volume signals** — topics appearing across multiple queries
   - **Engagement signals** — posts with unusually high engagement
   - **Recency signals** — topics that emerged in the last 24-48 hours
   - **Developer relevance** — topics that developers would want to read about

## How to monitor Discord

If the Discord bot is configured (check for DISCORD_BOT_TOKEN in .env):

1. Check the most active channels in target servers
2. Look for topics with high message volume in the last 24 hours
3. Identify frequently mentioned keywords, projects, or EIPs

## Output format

Present findings to the user as a ranked list:

```
🔥 Trending Topics (Last 24h)

1. [TOPIC] — Why it's trending, engagement metrics
   Suggested angle: "..."

2. [TOPIC] — Why it's trending, engagement metrics
   Suggested angle: "..."

3. [TOPIC] — Why it's trending, engagement metrics
   Suggested angle: "..."
```

Then ask: "Want me to generate an article on any of these? Just say the number or the topic."

If the user picks a topic, hand off to the `content-pipeline` skill.
