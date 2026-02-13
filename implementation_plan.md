# Implementation Plan: Verifiable Content Generation Pipeline ($0 Build)

This plan outlines the steps to build a fully autonomous, verifiable content generation pipeline using **OpenClaw**, **Ollama**, **EigenAI**, and **Ghost CMS**, all running locally or within free tiers.

## Architecture Overview
- **Monitoring Layer**: OpenClaw Browser Skill (X) + Discord Bot (Discord.js).
- **Generation Layer**: 
    - **Drafting**: Local Ollama (qwen3:32b).
    - **Verification**: EigenAI (1M free tokens pass).
- **Storage Layer**: EigenDA (via EigenAI integration).
- **Distribution Layer**: Self-hosted Ghost (Docker) + X/Discord/Notion APIs.

---

## Phase 1: Foundation & Local Infrastructure
### 1.1 Project Initialization
- [ ] Initialize the project directory.
- [ ] Create `docker-compose.yml` for Ghost CMS and MySQL.
- [ ] Install OpenClaw locally: `npm install -g openclaw`.

### 1.2 Ollama Setup (User Action Required)
- [ ] Install Ollama from [ollama.ai](https://ollama.ai).
- [ ] Pull required models:
    - `ollama pull qwen3:32b` (Primary Writer)
    - `ollama pull deepseek-r1:14b` (Fallback Reasoner)

### 1.3 OpenClaw Onboarding
- [ ] Configure `~/.openclaw/openclaw.json` to point to local Ollama and set up the default agents.

---

## Phase 2: Monitoring & Intelligence Layer
### 2.1 Trend Monitoring Skills
- [ ] **Twitter Scraper**: Build an OpenClaw browser skill to scrape trending topics/posts without using the paid X API.
- [ ] **Discord Monitor**: Setup a Discord bot (free) to listen to specific developer/crypto channels.

### 2.2 Brief Generator
- [ ] Create a "Content Strategist" agent in OpenClaw that synthesizes trends into a content brief.
- [ ] Integrate Telegram/Discord for "Human-in-the-loop" approval of briefs.

---

## Phase 3: The Multi-Agent Content Pipeline
### 3.1 Researcher Agent (Ollama)
- [ ] Implement browser tool usage to gather technical depth on the approved brief.
- [ ] Output: Structured research notes and SEO keywords.

### 3.2 Writer Agent (Ollama)
- [ ] Implement structured drafting based on research notes.
- [ ] Focus on long-form technical content (2000+ words).

### 3.3 Verifier Agent (EigenAI)
- [ ] Integrate the EigenAI (deTERMinal) API.
- [ ] Pass the final draft through EigenAI for a "Verification Pass".
- [ ] Capture cryptographic metadata: `model_digest`, `prompt_hash`, `response_hash`, and `eigenda_blob_id`.

---

## Phase 4: Distribution & Deployment
### 4.1 Ghost CMS Integration
- [ ] Create a skill to post content to the self-hosted Ghost instance via Admin API.
- [ ] Embed "Verified by EigenAI" metadata/badges in the post.

### 4.2 Social Distribution
- [ ] **Twitter**: Post threads via the X Free API (500 posts/mo).
- [ ] **Discord**: Share links and summaries in community channels.
- [ ] **Notion**: Log every article’s metadata and proof for internal tracking.

---

## Phase 5: Polish & Automation
- [ ] **Cloudflare Tunnel**: Expose the local Ghost instance for public access (optional but recommended).
- [ ] **Cron Jobs**: Schedule the pipeline to run autonomously (e.g., check trends every 4 hours).
- [ ] **Verification Portal**: Build a simple `/verify` command to check EigenDA proofs.

---

## Success Criteria
1.  **Fully Local**: Zero monthly subscription costs (excluding hardware/electricity).
2.  **Verifiable**: Every article has a cryptographic proof of origin.
3.  **Autonomous**: System can go from "Trend detected" to "Thread posted" with minimal human intervention.
