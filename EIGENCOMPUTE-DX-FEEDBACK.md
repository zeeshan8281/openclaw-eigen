# EigenCompute Developer Experience Feedback

Compiled from hands-on experience building and deploying an autonomous AI agent (OpenClaw/Alfred) on EigenCompute TEE infrastructure. This covers every friction point, documentation gap, and developer experience issue encountered across multiple deployment cycles.

---

## 1. CLI Interactive Prompts — Unscriptable by Design

### 1.1 Cannot automate `ecloud compute app deploy`
The deploy command uses interactive prompts (powered by Inquirer.js or similar) that **cannot be reliably piped with `echo` or `yes`**. The only reliable method is `expect` scripts, which are fragile and OS-dependent. This is a fundamental blocker for CI/CD pipelines.

### 1.2 Prompt sequence is undocumented and changes between versions
The sequence of interactive prompts during `ecloud compute app deploy` is not documented anywhere. Between ecloud-cli versions, new prompts are silently added:
- v0.3.x added "Do you want to view your app's logs?" (3 options)
- v0.3.x added "Show resource usage (CPU/memory) for your app?" (2 options)
- v0.3.x added a full profile flow (Website URL, Description, Twitter, icon upload, confirm)
- None of these are mentioned in any changelog or documentation

### 1.3 No `--yes` or `--non-interactive` flag
There is no way to pass `--yes`, `--non-interactive`, or `--auto-approve` to skip confirmations. Every deploy requires manually navigating 8+ interactive prompts.

### 1.4 No CLI flags for deploy options
There are no `--image`, `--instance`, `--name` flags to pre-fill deploy options. Everything must go through the interactive flow. Compare with `fly deploy --image foo/bar:latest` (Fly.io) or `gcloud run deploy --image` (GCP) which are fully scriptable.

### 1.5 Terminate confirmation cannot be reliably automated
`ecloud compute app terminate <id>` requires a y/N confirmation that doesn't accept simple pipe input (`echo "y" | ecloud ...` works inconsistently). Again requires `expect`.

---

## 2. Deployment Reliability

### 2.1 "Deploy from registry" silently fails to provision
When using "Deploy existing image from registry" method, the on-chain transaction succeeds but the instance often fails to provision. The app shows `Status: Unknown` indefinitely with `IP: REDACTED`. No error is surfaced — the deploy appears successful from the CLI output but the app never starts.

### 2.2 No deployment logs or failure reasons
When a deploy fails to provision, there is zero feedback. No logs, no error message, no status page showing what went wrong. The app just sits in "Unknown" status forever. Was it an image pull failure? Resource exhaustion? Networking issue? There's no way to know.

### 2.3 "Build from Dockerfile" method is the only reliable path
After multiple failed "deploy from registry" attempts, switching to "Build and deploy from Dockerfile" was the only method that reliably provisioned instances. This is not documented as a known issue or recommended approach.

### 2.4 Inconsistent app provisioning times
Some deploys provision in ~60 seconds, others take 5+ minutes, and some never provision at all. There's no estimated time or progress indicator during provisioning.

### 2.5 Ghost apps that don't show in `app list`
After a deploy transaction succeeds, the app sometimes doesn't appear in `ecloud compute app list` at all, despite having a valid App ID and on-chain transaction. `app info <id>` shows it with `Status: Unknown`. These ghost apps cannot be started or managed.

### 2.6 `app start` fails on ghost apps with opaque error
Attempting `ecloud compute app start` on a failed-to-provision app returns `EstimateGasExecutionError: Execution reverted for an unknown reason` — no human-readable error explaining what went wrong or how to fix it.

---

## 3. Rate Limiting

### 3.1 Aggressive 429 rate limiting on the UserAPI
The EigenCompute API rate limits aggressively. During deploy, the CLI polls for app status and gets flooded with `429 Error - Too Many Requests`. This means:
- The CLI cannot confirm if the deploy succeeded
- `app list` and `app info` commands fail during/after deploys
- The user has no way to check their deployment status

### 3.2 Rate limit wait times are inconsistent
The 429 responses suggest wait times of 0s, 1s, 2s, 3s — but the CLI gets rate-limited again immediately after waiting. The retry logic doesn't seem to respect the actual cooldown period.

### 3.3 No rate limit documentation
There's no documentation on:
- What the rate limits are (requests per minute/hour)
- How to stay within limits
- Whether there are different tiers or ways to increase limits
- Whether the CLI has built-in backoff (it appears to, but it's not effective)

### 3.4 Cloudflare blocks compound the issue
In addition to API-level 429s, Cloudflare sometimes blocks requests entirely. This creates a double layer of rate limiting that's hard to reason about or work around.

---

## 4. Environment Variables & Secrets

### 4.1 No way to inspect sealed secrets
Once secrets are sealed into a TEE deployment, there's no way to verify which environment variables are actually set inside the container. If an env var name is misspelled or a value is wrong, the only debugging path is to add logging to your application code, redeploy, and check logs (if logs even work — see section 6).

### 4.2 No documentation on which env vars EigenCompute injects
EigenCompute injects certain env vars (KMS paths, signing keys, etc.) but there's no comprehensive list of what's available inside the TEE. We had to discover `kms-signing-public-key.pem` at `/usr/local/bin/` by trial and error.

### 4.3 No `ECLOUD_APP_ID` env var injected
The App ID is a critical piece of attestation data, but it's not automatically injected as an environment variable inside the container. The developer has to manually add it to their env config and redeploy every time the App ID changes (which is every deploy, since terminate + redeploy creates a new ID).

### 4.4 No `IMAGE_DIGEST` env var injected
The Docker image digest (sha256) is not available inside the container. This is important for attestation — proving which exact image is running. Docker doesn't expose this by default and EigenCompute doesn't inject it either.

### 4.5 Secret rotation requires full redeployment
There's no way to update sealed secrets without terminating and redeploying the entire app. This means every secret rotation incurs:
- Downtime during termination
- 60+ second Telegram polling lock release wait
- New App ID (breaking any external references)
- New IP address (breaking any DNS/firewall rules)

---

## 5. Networking & Ports

### 5.1 No documentation on which ports are exposed
It's unclear which ports on the TEE instance are accessible from the internet. Port 3001 (our internal API) was sometimes reachable externally and sometimes not, with no documentation explaining the firewall rules.

### 5.2 No port configuration in deploy flow
There's no way to specify which ports should be exposed during deployment. Compare with Docker's `-p` flag or Fly.io's `[services]` config.

### 5.3 IP address changes on every deploy
Each new deployment gets a new IP address. There's no static IP, no DNS integration, and no way to maintain a stable address across deploys. This makes it impossible to:
- Set up DNS records reliably
- Configure webhooks that point to the app
- Share a stable API endpoint with consumers

---

## 6. Logging & Debugging

### 6.1 Logs permission error despite selecting "admin viewable"
During deploy, we selected "Yes, but only viewable by app and platform admins" for log visibility. But `ecloud compute app logs <id>` returned `403 Error - Caller does not have permission to view app logs`. The deployer themselves cannot view logs.

### 6.2 No `docker exec` or SSH equivalent
There's no way to get a shell inside the running TEE container for debugging. This is understandable for security, but the lack of functioning logs (see 6.1) means there's **zero observability** into what's happening inside the container.

### 6.3 No health check configuration
There's no way to configure health checks that EigenCompute monitors. If the app crashes after startup, it just sits there with `Status: Running` but no actual process alive. No automatic restarts, no alerts.

### 6.4 No way to see container stdout/stderr
Even if the app writes to stdout/stderr (which Node.js does by default), there's no way to access this output if `app logs` is broken.

---

## 7. App Lifecycle

### 7.1 Terminate + redeploy is the only update path
There's no `ecloud compute app upgrade` that does a rolling update or in-place image swap. The only way to update is:
1. Terminate (destroys the app permanently)
2. Wait 60+ seconds (for Telegram polling lock / other stateful connections)
3. Deploy fresh (new App ID, new IP, new on-chain transaction)

### 7.2 `app upgrade` command exists but behavior is unclear
`ecloud compute app upgrade` is listed in `--help` but its behavior, requirements, and limitations are not documented. Does it preserve the App ID? The IP? The sealed secrets? Unknown.

### 7.3 One bot token = one polling connection
If you're running a Telegram bot, only one instance can hold the polling connection. Terminating an app doesn't immediately release the polling lock — Telegram holds it for ~60 seconds. This creates a mandatory wait window during every deploy that's not documented anywhere in EigenCompute docs.

### 7.4 No zero-downtime deploys
There's no blue-green, canary, or rolling deploy strategy. Every update means full downtime: terminate → wait → deploy → wait for provision → wait for app boot. Total downtime is typically 3-5 minutes.

---

## 8. Documentation Gaps

### 8.1 No end-to-end deployment tutorial
There's no guide that walks through: "Here's a Dockerfile, here's how to deploy it, here's how to set env vars, here's how to verify it's running, here's how to update it."

### 8.2 No TEE-specific developer guide
Developers building for TEE need to know:
- What files/paths are available inside the TEE (KMS keys, signing tools)
- What env vars are injected
- What the attestation flow looks like
- How to verify their app is running in a real TEE vs. a regular container
- None of this is documented

### 8.3 No troubleshooting guide
Common issues and their fixes are not documented:
- App stuck in "Unknown" status → ?
- 429 rate limiting → ?
- Logs returning 403 → ?
- Deploy succeeds but app doesn't start → ?

### 8.4 No API reference
The EigenCompute UserAPI that the CLI calls is not documented. Developers who want to build their own tooling or CI/CD integrations have no reference.

### 8.5 No example projects or starter templates
There are no reference implementations showing how to build a TEE-ready application. What should the Dockerfile look like? How should entrypoint scripts handle `compute-source-env.sh`? How to access KMS signing? All discovered through trial and error.

### 8.6 KMS signing key usage is undocumented
A PEM file exists at `/usr/local/bin/kms-signing-public-key.pem` inside the TEE, and a `kms-client` binary is present. But there's no documentation on:
- How to use the KMS client
- What signing operations are supported
- How to verify signatures externally
- What the key represents / who trusts it

---

## 9. On-Chain / Verification

### 9.1 Dashboard shows minimal information
The verification dashboard (verify-sepolia.eigencloud.xyz) shows basic app info but doesn't surface:
- The actual Docker image digest running
- Environment configuration (non-secret)
- Attestation reports / TDX quotes
- Uptime history or deployment history

### 9.2 App ID changes on every deploy
Since terminate + redeploy creates a new App ID, there's no persistent on-chain identity for an application. Any external system referencing the App ID breaks on every update.

### 9.3 No attestation endpoint built into the platform
EigenCompute doesn't provide a built-in `/attestation` endpoint that returns TDX quotes, image measurements, or platform-level proofs. We had to build our own attestation module from scratch by scraping whatever data was available inside the container.

---

## 10. Cost & Billing

### 10.1 Deploy cost shown but not explained
The CLI shows "Estimated transaction cost: 0.008256 ETH" but doesn't explain:
- What this covers (compute time? on-chain registration? both?)
- Whether there are ongoing costs
- How billing works for running instances
- Whether failed deploys (that never provision) are refunded

### 10.2 Failed deploys still cost gas
Deploy transactions that succeed on-chain but fail to provision still consume gas. After 3-4 failed "deploy from registry" attempts, we spent gas with nothing to show for it.

---

## 11. CLI UX

### 11.1 `app info` redacts IP for own apps
Running `ecloud compute app info <my-own-app>` shows `IP: REDACTED`. The developer cannot see the IP of their own app through `app info` — they have to use `app list` instead. This is confusing and inconsistent.

### 11.2 Deploy output doesn't always show IP
When the CLI gets rate-limited during the post-deploy status check, it exits without showing the IP address. The developer has to run `app list` separately (which may also be rate-limited).

### 11.3 No `--json` output flag
No commands support `--json` output for machine-readable results. This makes scripting and automation harder than it needs to be.

### 11.4 Version mismatch between CLI and platform
The CLI version (0.3.3) and the platform it connects to may have different expectations. There's no compatibility matrix or version check warning.

### 11.5 `--watch` flag mentioned but behavior unclear
Error messages reference `--watch` flag (e.g., for logs) but its behavior, polling interval, and resource consumption aren't documented.

---

## Summary

The core TEE infrastructure works — once an app is running inside EigenCompute, the Intel TDX attestation, KMS signing keys, and sealed secrets all function correctly. The problems are almost entirely in the **developer experience layer**:

- **Deployment is fragile and unscriptable** — interactive-only CLI with no CI/CD path
- **Zero observability** — logs don't work, no shell access, no health checks
- **No stable identity** — IP and App ID change on every deploy
- **Undocumented platform internals** — TEE paths, env vars, KMS usage all discovered by trial and error
- **Rate limiting makes the platform feel broken** — can't check your own app status after deploying

The gap between "TEE running correctly" and "developer can reliably build on this" is significant. Closing it would make EigenCompute genuinely competitive for autonomous agent deployments.
