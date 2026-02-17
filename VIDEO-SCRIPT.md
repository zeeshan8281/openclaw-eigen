# OpenCLAW-Eigen — Video Walkthrough Script

**Total estimated time: ~5 minutes**
**Format: Screen recording with voiceover**

---

## PART 1: INTRO + CODE (~3 min)

---

### Scene 1: Intro (30 sec)

**[Screen: GitHub repo page]**

> "Hey everyone — I'm going to walk you through Alfred. It's built on OpenClaw — an open-source autonomous agent framework — running inside an EigenCompute TEE. OpenClaw gives us the agent brain, Telegram bot, and agent-to-agent protocol. We built a data backend on top of it that crawls eight sources — Twitter, HackerNews, BBC, crypto feeds — scores headlines with AI, and sells access via on-chain Sepolia ETH payments. Everything is attested by the TEE."

---

### Scene 2: How It Connects — [`entrypoint.sh`](./entrypoint.sh) + [`openclaw.json`](./openclaw.json) (45 sec)

**[Open [`entrypoint.sh`](./entrypoint.sh)]**

> "Two processes run inside the TEE. Our curator on port 3001 — crawls feeds, scores headlines, handles payments. And OpenClaw gateway on port 3000 — that's the agent brain, Telegram bot, A2A protocol. They talk over localhost."

**[Switch to [`openclaw.json`](./openclaw.json)]**

> "OpenClaw config — Llama 3.3 70B as the reasoning LLM via OpenRouter, Telegram channel named 'Alfred', web tools denied so Alfred only uses our curated data. Zero Telegram code — OpenClaw handles all of it from this config."

---

### Scene 3: Agent Identity + Payments — [`AGENTS.md`](./AGENTS.md) + [`SKILL.md`](./src/skills/curator/SKILL.md) (45 sec)

**[Open [`AGENTS.md`](./AGENTS.md), scroll to payment section]**

> "AGENTS.md is Alfred's operating manual. The critical part — payment enforcement. Before sharing signals or briefings, the LLM checks if the Telegram user has paid by curling our payment API with their chat ID. If unpaid, it tells them to send 0.001 Sepolia ETH. When they send a tx hash, the LLM verifies it on-chain. No hardcoded middleware — the agent enforces payments autonomously from these instructions."

**[Switch to [`src/skills/curator/SKILL.md`](./src/skills/curator/SKILL.md)]**

> "The skill bridge — this markdown file teaches the LLM how to call our backend. Literal curl commands. The LLM reads these, decides which endpoint to hit, executes it, and formats the response. That's the entire OpenClaw-to-backend integration — natural language instructions, not code."

---

### Scene 4: Curator + API — [`src/curator.js`](./src/curator.js) + [`src/autonomous.js`](./src/autonomous.js) (45 sec)

**[Open [`src/curator.js`](./src/curator.js)]**

> "The curator crawls eight sources every 4 hours — RSS feeds, HackerNews API, Twitter v2. Each headline gets SHA-256 deduped, then scored 1-10 by the LLM. Anything 8+ becomes a high-signal item."

**[Switch to [`src/autonomous.js`](./src/autonomous.js), highlight A2A endpoint]**

> "The Express API exposes this data — and handles the A2A protocol. Agent discovery at `/.well-known/agent.json` follows OpenClaw's standard — any agent can crawl it, see skills, pricing, and payment wallet. The `/a2a` endpoint uses JSON-RPC: unpaid requests get payment instructions, paid requests with a tx hash get verified on-chain and served data. OpenClaw-compatible agents can discover and transact with Alfred out of the box."

---

### Scene 5: TEE Attestation — [`src/services/tee-attestation.js`](./src/services/tee-attestation.js) (15 sec)

**[Open [`src/services/tee-attestation.js`](./src/services/tee-attestation.js)]**

> "Every API response includes TEE attestation — config hash of AGENTS.md, SOUL.md, and openclaw.json, plus KMS key fingerprint from EigenCompute. If anyone tampers with the agent's behavior or payment rules, the hash changes. Cryptographic proof, not trust."

---

## PART 2: LIVE DEMO (~2 min)

---

### Scene 6: Telegram Payment Flow (60 sec)

**[Screen: Telegram app, chat with Alfred]**

**[Type "what's the latest news?"]**

> "I ask Alfred for news. It checks payment — I haven't paid — so it tells me to send 0.001 Sepolia ETH to the payment wallet. The LLM decided this autonomously."

**[Show MetaMask payment, then type tx hash to Alfred]**

> "I pay, give Alfred the tx hash. It verifies on-chain — payment confirmed. Now I get scored signals from all eight sources, formatted conversationally by the LLM."

---

### Scene 7: A2A Agent Flow (45 sec)

**[Switch to terminal]**

**[Run: `curl -s http://34.148.22.57:3001/.well-known/agent.json | python3 -m json.tool`]**

> "Agent-to-agent — another AI agent discovers Alfred via the agent card. Skills, pricing, payment wallet — all machine-readable."

**[Run: `curl -s -X POST http://34.148.22.57:3001/a2a -H 'Content-Type: application/json' -d '{"method":"tasks/send","params":{"task":{"skill":"signals"}}}' | python3 -m json.tool`]**

> "Request without payment — gets 'payment-required'. The agent pays on-chain programmatically — four lines of code, no human — then resends with the tx hash. Alfred verifies on Sepolia and returns the data. Three HTTP calls, one blockchain transaction, fully autonomous."

```javascript
const tx = await wallet.sendTransaction({
  to: "0x9Bbb183043b87451B2E7E44DcFc03a32904C0A98",
  value: ethers.parseEther("0.001")
});
await tx.wait();
```

---

### Scene 8: Attestation + Dashboard (15 sec)

**[Run: `curl -s http://34.148.22.57:3001/health | python3 -m json.tool`]**

> "Every response carries TEE attestation — KMS fingerprint, config hash, platform Intel TDX. Verifiable on the [EigenCompute dashboard](https://verify-sepolia.eigencloud.xyz/app/0x416987cc995B1BAd7646CC2B8Cc45Def5e8C6dbA)."

---

### Scene 9: Closing (15 sec)

> "OpenClaw gives us the autonomous agent — Telegram, LLM reasoning, A2A protocol. We built the data backend — crawling, scoring, payment verification. EigenCompute gives us the TEE and attestation. Together, it's a verifiable data market where agents can discover, pay, and consume intelligence autonomously. Code is open source, Alfred is live. Thanks."

---

## PRODUCTION NOTES

- **Screen recording**: Clean terminal theme, large font
- **Editor**: VS Code/Cursor, minimal theme, file tree visible
- **Telegram**: Desktop app, zoomed in
- **Terminal**: Pipe curls through `python3 -m json.tool`
- **Wallet**: Have MetaMask ready with Sepolia ETH
- **Current IP**: `34.148.22.57`
- **Current App ID**: `0x416987cc995B1BAd7646CC2B8Cc45Def5e8C6dbA`
- **Dashboard URL**: `https://verify-sepolia.eigencloud.xyz/app/0x416987cc995B1BAd7646CC2B8Cc45Def5e8C6dbA`
- **Payment wallet**: `0x9Bbb183043b87451B2E7E44DcFc03a32904C0A98`
