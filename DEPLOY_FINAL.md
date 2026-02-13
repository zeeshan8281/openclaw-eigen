# 🚀 Autonomous Agent Deployment Guide (Phase 3)

You have successfully built a fully autonomous, verifiable news agent.
There are two isolated components:

1.  **The Agent** (`autonomous-agent/`) -> Runs on EigenCompute (Cloud TEE).
2.  **The Website** (`autonomous-website/`) -> Runs on Vercel/Netlify.

---

## ☁️ 1. Deploy the Website (The Publisher)
First, deploy the website so you have a public URL to publish to.

### Instructions (Vercel)
1.  Navigate to the website folder:
    ```bash
    cd autonomous-website
    ```
2.  Deploy (requires Vercel CLI):
    ```bash
    npx vercel
    ```
3.  **Note the URL**: e.g., `https://autonomous-news.vercel.app`.

*(Crucial: Since Vercel is read-only, for persistent storage you must swap the `fs.writeFileSync` in `pages/api/publish.js` with a database call (Supabase/Firebase) or GitHub Commit API. For a quick demo, deploy to a VPS or Render.com where disk writing works).*

---

## 🔒 2. Deploy the Agent (The Brain)
Now deploy the agent to the secure enclave.

### Instructions (EigenCloud)
1.  Navigate to the agent folder:
    ```bash
    cd autonomous-agent
    ```
2.  Deploy with CLI:
    ```bash
    ecloud compute app deploy
    ```
    *Select "Build from Dockerfile".*

3.  Set Environment Variables:
    ```bash
    ecloud compute app env set \
      EIGENAI_API_URL="https://determinal-api.eigenarcade.com" \
      WALLET_PRIVATE_KEY="<YOUR_PRIVATE_KEY>" \
      PUBLISH_URL="https://your-site.vercel.app/api/publish" \
      CRON_INTERVAL="86400000"
    ```

---

## 🔄 The Cycle
1.  Every **24 hours**, the EigenCloud Agent wakes up.
2.  It uses **EigenAI** to write and verify an article about a trending topic.
3.  It **POSTs** the article + cryptographic proof to your Website.
4.  The Website displays it immediately.
5.  **Total Cost**: $0 (Free tiers). **Total Effort**: 0 (Autonomous).
