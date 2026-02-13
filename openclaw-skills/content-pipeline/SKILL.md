---
name: content-pipeline
description: Generate a verified technical article using the multi-agent pipeline (Ollama + EigenAI + EigenDA)
---

# Content Pipeline Skill

This skill runs the full verifiable content generation pipeline. It takes a topic, generates a researched and polished article using local Ollama for drafting and EigenAI for cryptographic verification, then stores the proof on EigenDA.

## When to use this skill

Use this skill when the user asks you to:
- Write a technical article or blog post
- Generate verified content about a topic
- Run the content pipeline
- Create a new article

## How to run

1. Extract the topic from the user's message. If no topic is specified, ask for one.

2. Run the pipeline script:
```bash
node /Users/zeeshan/Downloads/eigen-openclaw/src/pipeline.js "<TOPIC>"
```

3. The pipeline will run 4 agents in sequence:
   - **Agent 1 (SEO Researcher)** — runs on local Ollama (free), outputs keyword research and outline
   - **Agent 2 (Draft Writer)** — runs on local Ollama (free), outputs a 2000+ word article draft
   - **Agent 3 (Verifier)** — runs on EigenAI (uses free token credits), polishes and cryptographically verifies the article
   - **Agent 4 (Proof Storage)** — stores verification proof on EigenDA

4. Once complete, the output is saved to a timestamped folder under:
   ```
   /Users/zeeshan/Downloads/eigen-openclaw/output/<timestamp>_<topic-slug>/
   ```
   With these files:
   - `1-research.md` — SEO research and outline
   - `2-draft.md` — Raw draft from Ollama
   - `3-final-article.md` — Final verified article
   - `4-proof.json` — Cryptographic proof metadata (EigenAI model, token usage, EigenDA commitment)

5. After the pipeline completes, read the `3-final-article.md` file and share a summary with the user. Include:
   - Word count
   - Whether it was verified by EigenAI
   - The EigenDA commitment (if available)
   - The output directory path

6. Ask the user if they want to:
   - **Publish** it (use the `publish-article` skill)
   - **Edit** it (make changes to the final article)
   - **Regenerate** it with a different angle

## Prerequisites

Before running, ensure all services are healthy:
```bash
node /Users/zeeshan/Downloads/eigen-openclaw/src/health-check.js
```

Required services:
- **Ollama** must be running locally (`ollama serve`)
- **EigenAI** grant must be active (check at https://terminal.eigencloud.xyz)
- **EigenDA Proxy** should be running at localhost:3100

## Token Budget

Each article uses approximately 4,000-5,000 EigenAI tokens. The user has a 1M free token budget. Monitor remaining tokens in the pipeline output.
