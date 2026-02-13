---
name: curator
description: Automated Crypto News Curation & Signal Detection for OpenClaw.
version: 1.0.0
---

# Curator Agent

This skill allows OpenClaw to fetch, read, and score crypto news headlines from RSS feeds.

## Actions

### `curator.fetch`
Fetch the latest headlines from configured RSS feeds.

### `curator.score(item)`
Use the LLM to score a news item (1-10) based on industry impact.

### `curator.digest`
Generate a digest of High Signal items from the last 24 hours.

## Behavior

The Curator runs autonomously on a schedule (Cron).
It maintains a persistent memory of `seen_items` to avoid duplicates.
It writes High Signal findings to `memory/signals.json`.
