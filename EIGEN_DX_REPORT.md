# Developer Experience (DX) Friction Report: EigenCompute (EigenCloud)

**Project:** OpenCLAW Autonomous News Agent  
**Environment:** EigenCompute TEE (Sepolia Testnet)  
**Date:** February 13, 2026

## Executive Summary
Developing for EigenCompute TEEs currently feels like "dark room debugging." The primary hurdle is the **Feedback Vacuum**: when a deployment fails during the initialization phase, no logs are generated, and the platform provides no diagnostic state (e.g., "Glibc mismatch," "Entrypoint not found," or "Image pull error"). This leads to expensive trial-and-error cycles.

---

## 1. Observability & Debugging Gaps

### 1.1 The "Logs Not Available" Deadlock
*   **Issue:** If an application fails within the first ~5 seconds (initialization/startup), the CLI returns: `App logs not available for status failed`.
*   **Impact:** Fatal. There is no way to know if the crash was due to a missing library, a syscall violation, or a simple typo in the entrypoint.
*   **Recommendation:** Capture `stderr` from the TEE's container runtime even if the process exits immediately. Provide a "TEE Init" log stream.

### 1.2 The "Private Registry" Pull Trap
*   **Issue:** Even if `ecloud compute app deploy` successfully builds and pushes your image to GHCR, the TEE node (remote) may not have credentials to **pull** that image if the repository is private.
*   **Symptom**: App enters `Failed` state instantly with zero logs.
*   **Recommendation:** The CLI should validate image visibility or warn the user if no registry credentials are configured for the target environment.

---

## 2. Platform Resource & Quota Logic

### 2.1 "Failed" Apps Occupy Quota Slots
*   **Issue:** Applications that fail to start still occupy one of the 10 available "App ID" slots. 
*   **DX Trap:** Users try to deploy a "fix," but the fix fails because the previous "failures" haven't been manually terminated.
*   **Recommendation:** Automatically garbage-collect apps that fail within the first 60 seconds.

### 2.2 CLI Rate Limiting (429) 
*   **Issue:** Standard flows (fetching instance types, checking status) frequently hit "Too Many Requests."
*   **Recommendation:** Implement internal backoff/retry in the CLI.

---

## 3. CLI & Command UX

### 3.1 Terminology: `delete` vs `terminate`
*   **Issue:** Intuition leads to `delete`, but the command is `terminate`. 
*   **Recommendation:** Support `delete` as an alias.

### 3.2 In-Flight Transaction Bottlenecks
*   **Issue:** Cleaning up 10 failed apps requires 10 on-chain transactions. Sepolia rate-limits in-flight transactions.
*   **Recommendation:** Allow batch termination (`ecloud compute app terminate --all --failed`).

---

## 4. TEE Runtime & Compatibility

### 4.1 Base Image "Guessing Game"
*   **Issue:** Standard "Slim" images face silent failures. Full `ubuntu:22.04` is more stable but requires manual Node setup.
*   **Recommendation:** Provide "Eigen-Certified" base Docker images.

### 4.2 The `compute-source-env.sh` Gotcha
*   **Issue:** Accessed secrets require manually sourcing `/usr/local/bin/compute-source-env.sh`.
*   **Recommendation:** The TEE runtime should auto-inject these into the environment.

---

## 5. Final Recommendations for EigenLabs
1.  **Transparent Env:** Auto-inject unsealed secrets into the shell environment.
2.  **Verbose Failure:** If an app fails in `< 10s`, show the last 50 lines of `stderr`.
3.  **Batch Actions:** Add `--all` or `--failed` flags to the `terminate` command.
4.  **Quota Awareness:** Show `Quota: 7/10` in the output of `ecloud compute app list`.
5.  **Visibility Check:** Warn if deploying from a private repository without platform secrets.
