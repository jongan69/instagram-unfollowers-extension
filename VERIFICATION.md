# v1.1.1 audit follow-up

The reported v1.1.0 failures exposed real gaps missed by the original Chrome 159-only synthetic smoke test. This audit does not claim zero bugs.

- **WebMCP compatibility (confirmed and fixed):** reproduced the exact document.domain registration exception in Chrome for Testing 156.0.8078.80 using a domain-keyed environment. Extension COOP/COEP policies made `crossOriginIsolated` true and native registration/read-only invocation succeed. Browser tests now cover 156 and 159; no insecure fallback or page bridge was added.
- **Initial HTTP 429 (failure point confirmed, server cause unresolved):** source + reported `phase:starting` identify v1.1.0's `/api/v1/users/<id>/info/` preflight, before pagination. That mobile-style dependency has been removed. List and closing count validation now use the web GraphQL interface. No live evidence establishes whether the original 429 was caused by endpoint policy, account/session/IP restrictions or other Instagram controls. No cooldown-bypassing retries were attempted.
- **Rate-limit handling (fixed):** preserve safe HTTP endpoint/status/Retry-After diagnostics; persist a shared minimum 15-minute local cooldown; honor longer server waits; migrate recent legacy 429 failures; block repeated scan and mutation starts across reloads. Requests are paced at least one second apart, including phase boundaries. This is not a server recovery guarantee.
- **Baseline publication (fixed):** final snapshot, terminal job and UI state publish together. Injected storage failure preserves the previous complete baseline.
- **Status/UI (fixed):** reconcile stale running dispatch receipts, disable scan/preparation during jobs or cooldowns, stop calling cookie presence a confirmed login, and abort pending work when the account changes.
- **Import validation (fixed):** reject normalized impossible calendar dates instead of accepting Date.parse alone.

Final source verification: **54 tests passed**; typecheck and packaged production build passed. Installed native smoke checks passed in Chrome for Testing **156.0.8078.80** (including the domain-keyed reproduction) and **159.0.8137.0**.

Verification commands: `npm test`, `npm run typecheck`, `npm run package`, and `tests/browser-smoke.cjs` against Chrome for Testing 156 and 159. All Instagram API responses in these automated tests are synthetic; no real unfollows or API probes were performed. TEST_LEGACY_DOMAIN=1 adds the Chrome 156 domain-keyed reproduction condition. Full live Instagram enumeration and actual natural-language agent invocation remain pending. Browser debugging on the user's Instagram tab timed out, so the audit did not obtain fresh live response headers.

The original v1.1.0 evidence below is retained as historical context; its account metadata preflight and Chrome-159-only coverage have been superseded.

## v1.1.0 verification (historical)

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
