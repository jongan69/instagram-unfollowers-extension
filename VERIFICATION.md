# v1.1.0 verification

Acceptance criteria:

- Only complete, stable-ID-deduplicated follower **and** following lists publish a snapshot. Empty positive-count edges, malformed or stalled pagination, count drift, missing accounts, rate limits and errors fail visibly. Cancellation aborts requests and waits. Failed scans preserve the last complete snapshot.
- Nonfollowers and earlier followers now absent are separate results. Missing/renamed/unavailable accounts never prove voluntary unfollowing.
- Eight optional native tools validate strict inputs, register with AbortSignal cleanup, return job IDs promptly, and expose status/recovery. Normal UI works without WebMCP. Reloaded jobs reconcile as interrupted; live jobs survive worker suspension.
- Cleanup needs an exact reviewed list, stable IDs, reasons and extension-owned user approval. It rechecks, paces, verifies, stops on uncertainty/rate limit and forbids approval replay. No Instagram-page mutation bridge exists.
- Installation, prompts and schema/account-validated local baseline import/export are documented. Personal test data is synthetic and exports stay out of Git.

## Source checks

`npm test`: 44 passing focused regressions. Includes the original positive-count/empty-edges bug, overlap deduplication, terminal truncation, repeated/missing cursors, count changes, malformed IDs, cancellation, request timeout, HTTP failures, rename-safe history, account/schema import checks, atomic history rotation, rejected/expired/replayed approval, per-account verification and rate-limit stop, strict tool schemas and lifecycle cleanup, untrusted sender rejection, account-switch display isolation, and worker/reload reconciliation.

`npm run typecheck`: passing.

`npm run build`: passing using the existing webpack / TypeScript / Preact toolchain. Existing Sass legacy JS API deprecation warning remains.

## Installed extension / native API

Verified in a separate synthetic profile using Chrome for Testing **159.0.8137.0**, with `--enable-features=WebMCPTesting` and experimental web platform features. The initial installed Chrome 156 automated extension-loading attempt was unsupported; the official Chrome for Testing binary allowed unpacked loading.

- A minimal extension-origin boundary prototype successfully registered a native read-only tool, discovered it with `document.modelContext.getTools()`, invoked it with `executeTool()`, and aborted registration.
- The built extension loaded; all eight tools were discovered through the native API on `chrome-extension://<id>/agent.html`.
- Native `instagram_get_status` returned the synthetic logged-out state through the real extension worker/content-host boundary.
- Native invalid-argument and unapproved-execution invocations returned errors.
- Synthetic Instagram responses reproduced positive counts with empty edges; the job failed and the seeded complete baseline remained unchanged.
- Instagram-host reload reconciled a persisted running job to interrupted.
- Popup rendered without page errors. No real Instagram account/session was used; no real Instagram requests or mutation requests were sent.

Reproduce after `npm run build`, using an existing Playwright install:

```sh
CHROME_PATH=/absolute/path/to/chrome-for-testing \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
node tests/browser-smoke.cjs
```

This uses a temporary profile under ignored `.tooling/` and removes it afterward. Chrome for Testing supports unpacked-extension launch flags that ordinary branded Chrome may reject.

## Actual natural-language browser-agent invocation

**Not verified.** The current session reports no browser-agent surfaces and “Local browser use is disabled in Work settings.” Native discovery plus an in-page API test invocation is not evidence that Codex, ChatGPT or another LLM-driven browser agent can call these tools.

The browser agent must support native WebMCP on extension-origin tabs. Content-script-based agents can be restricted from another extension's pages, so the GoogleChromeLabs example agent is a reference, not a verified supported consumer for this design. No API keys were provisioned and no model-backed agent was configured.

Remaining live checks: enable/select a native agent with extension-tab support; target Agent / Review; prompt it to read status and verify the tool result. Then test a complete read-only scan against a logged-in Instagram account. Private Instagram endpoints are not a stable public API, so live endpoint compatibility remains unverified. Do not test cleanup with real unfollows merely to validate installation.
