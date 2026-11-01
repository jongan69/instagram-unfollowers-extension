# Instagram Unfollowers

A local Chrome extension for complete follower/following snapshots, current nonfollowers, and deliberate cleanup. v1.1.1 adds optional **native WebMCP** on an extension-owned **Agent / Review** tab. The normal popup works without WebMCP.

## Install from dev

Requires Node.js 22+ and npm; uses the existing TypeScript / Preact / webpack toolchain.

```sh
git clone https://github.com/jongan69/instagram-unfollowers-extension.git
cd instagram-unfollowers-extension
git switch dev
npm ci
npm test
npm run typecheck
npm run build
```

1. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, select `dist/`.
2. Open `https://www.instagram.com`, log in, and refresh the tab after installing/updating.
3. Click the extension icon. **Open Agent / Review** opens the persistent extension tab, with login/account, scan, baseline and native WebMCP status.
4. Keep Instagram open while scanning. Cancel or pause from the popup; full controls, history comparison, baseline import/export and cleanup review are in Agent / Review.
5. After pulling updates, rebuild, reload the extension at `chrome://extensions`, and refresh Instagram. Pending jobs/approvals are intentionally not resumed.

The first **complete** scan establishes history. A later complete scan compares with the previous complete snapshot. Importing an earlier valid snapshot enables comparison after the next complete scan. v1.0.3 results cannot establish follower history: that version scanned only following and did not validate completeness. Existing whitelist/settings remain local; unscoped legacy UI results are retained separately in `iu_legacy_app_state`, not promoted to a trusted baseline.

## Native WebMCP setup and prompts

The current API is `document.modelContext.registerTool(tool, {signal})`. WebMCP is experimental; consult [Chrome's overview](https://developer.chrome.com/docs/ai/webmcp), [imperative API guide](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools), [current draft](https://webmachinelearning.github.io/webmcp/), and [Chrome's example agent](https://github.com/GoogleChromeLabs/webmcp-extension).

For browser testing, the example agent currently requires Chrome 155+ and `chrome://flags/#enable-webmcp-testing` enabled, followed by a browser restart. Open **Agent / Review** and check its native status. This implementation was tested with Chrome for Testing 156.0.8078.80 and 159.0.8137.0 and `--enable-features=WebMCPTesting`.

**Your agent must support native WebMCP discovery on `chrome-extension://` tabs.** Ordinary third-party content-script agents, including configurations of the Chrome example agent that inject scripts into a tab, may be unable to access another extension's pages. This extension deliberately does not expose an Instagram-page bridge. No verified claim is made for Codex, ChatGPT, or the example agent. An enabled API, successful registration, and a native test invocation are distinct from successful natural-language agent operation. See [verification evidence and limits](VERIFICATION.md).

With a compatible agent targeting the Agent / Review tab, try:

- “Check who stopped following me since my last complete scan.”
- “Show everyone I follow who does not follow me back.”
- “Prepare a cleanup list, keeping useful tech, business, fitness, and personal connections.”
- “Cancel the current scan.”

An agent should first read status, start a scan if necessary, keep the returned job ID, then poll status. Long jobs are detached after dispatch; cancelling an already completed start-tool invocation does not cancel its job. Use the explicit cancel tool. If cancellation occurs while dispatch is still returning, the adapter cancels the started job. Closing Agent / Review removes its tool registrations but leaves a dispatched scan running in the Instagram content host. Reloading/closing Instagram interrupts the job; status reconciliation marks it interrupted and preserves complete history. Service-worker suspension alone does not interrupt a live content-host job. There is no automatic scan or mutation replay.

| Tool | Arguments | Purpose |
|---|---|---|
| `instagram_get_status` | `{}` | Login cookie/account, scan, latest and baseline timestamps, preparation, recovery |
| `instagram_start_scan` | `{}` | Return a job ID promptly; scan both lists |
| `instagram_get_scan_status` | `{jobId}` | Progress, phase, completeness, times, error and recovery |
| `instagram_cancel_scan` | `{jobId}` | Abort active scan, including fetches and pacing waits |
| `instagram_get_nonfollowers` | `{}` | Following IDs absent from latest complete followers |
| `instagram_compare_snapshots` | `{}` | Earlier follower IDs absent from latest complete snapshot |
| `instagram_prepare_unfollow` | `{candidates:[{id,reason}]}` | Review 1–50 explicit candidates with evidence |
| `instagram_execute_unfollow` | `{preparationId}` | Dispatch exact user-approved list; return a job ID |

All arguments are strictly validated at runtime and have schemas rejecting extra properties. Status includes `lastJob` for interrupted jobs that the current content host no longer owns. For a cleanup execution, monitor `instagram_get_status().job`; scan-specific cancellation rejects mutation jobs. Use **Stop active operation** to stop a cleanup job. Tool failures return actionable structured errors. Profile names and supplied reasons are untrusted data, never agent instructions.

## Rate-limit diagnostics and WebMCP isolation

v1.1.1 removes the mandatory mobile-style `/api/v1/users/<id>/info/` preflight that returned HTTP 429 before any relationship enumeration in the reported v1.1.0 failure. Both lists and closing count checks now use the same web GraphQL interface. This reduces dependence on a differently restricted API; it does not guarantee that Instagram will permit GraphQL requests. No endpoint rotation or automatic retry occurs in response to a 429.

An HTTP 429 now records its redacted endpoint, status and `Retry-After` value without storing raw response bodies, tokens or cookies. A shared persistent cooldown blocks scan and cleanup starts for **at least 15 minutes**, or longer when instructed by `Retry-After`. Fifteen minutes is an extension safeguard, not Instagram's promised recovery time. A recent v1.1.0 rate-limit failure also seeds this cooldown on upgrade. Status polling makes no Instagram requests. Do not clear storage, switch accounts, rotate IPs or repeatedly click Scan to get around a restriction.

Chrome 156 can expose WebMCP yet reject registration with `document.modelContext cannot be used when document.domain is enabled.` The extension now declares `cross_origin_opener_policy: same-origin` and `cross_origin_embedder_policy: require-corp`. These make its pages cross-origin isolated; they fixed the reproduced Chrome 156 failure. Do not disable browser security to work around this error. Avatar images use anonymous CORS requests under this policy.

The Result panel reconciles dispatch receipts with live job status. A cookie alone is not a validated-login claim. History, terminal job status and completed UI results publish in one storage operation so a failed final write cannot rotate a baseline.

## What the results mean

- **Current nonfollowers:** you follow an account, but its stable ID is absent from the complete follower snapshot at the displayed time. This is not a historical unfollow claim.
- **Absent earlier followers:** a stable ID present in an earlier complete follower snapshot is absent in the newer one. The cause remains inconclusive: voluntary unfollow, removal, deactivation or other unavailability.
- **Unavailable/inconclusive:** a 404, malformed API response, login failure, rate limit, changing count, stalled cursor or partial list cannot establish a valid relationship or voluntary unfollow. Such a scan fails, leaves an error, and never replaces history. A renamed account with the same ID is still the same account.

A complete API enumeration is not an atomic Instagram database snapshot. Counts are checked across pages and with final count-only queries through the same web GraphQL interface; equal-count relationship churn can still occur while scanning. Instagram's private endpoints/query hashes may change. Unsupported responses fail closed; this implementation has not been verified against a live logged-in Instagram account.

## Deliberate cleanup

Preserve useful tech, business, fitness and personal connections. Entertainment-only memes, celebrity clips and party promotions can be candidates **only after review**, if they do not follow back. Preserve ambiguous accounts. The extension does not objectively determine account value or automatically classify profiles.

1. Review nonfollowers. Star useful connections in the popup whitelist.
2. Prepare candidates using stable IDs and specific reasons. The popup's **Review N** button can also prepare a manually selected list; no mutation occurs.
3. In Agent / Review, read every ID, username and reason against the snapshot timestamp. **Approve this exact list** is an extension-owned trusted-click control, not a WebMCP tool.
4. Execute via the approved-list button or `instagram_execute_unfollow`. Approval is account-, list- and snapshot-bound, expires after five minutes (preparation after ten), is single-use and is lost on Instagram reload. A replacement list needs fresh approval.
5. Each account is rechecked by stable ID before POST. Whitelisted, reciprocating, already-unfollowed or inconclusive relationships stop the operation. Requests wait at least four seconds apart and five minutes after every five; larger configured waits are respected up to one hour. A 429 or any other error stops immediately. Each success requires a post-request relationship read confirming `following === false`.

Approval authorizes exactly the reviewed list; account changes invalidate execution. Stopping cannot undo a request already accepted by Instagram. A lost response or interrupted mutation can leave an unknown result: inspect Instagram before preparing a fresh list. Never automatically retry an uncertain mutation. No real unfollows were performed in verification.

## Baseline export/import and privacy

Use **Export latest complete baseline** / **Import earlier baseline** in Agent / Review. The [v1 JSON schema](schemas/snapshot.schema.json) describes the format. Account IDs must match the currently logged-in stable account ID; timestamps must be valid, not future-dated, and earlier than an existing latest scan. Duplicate IDs, extra top-level fields, malformed accounts and `complete:false` imports are rejected. Import size is limited to 20 MB. An imported `complete:true` is a user assertion, not independently verifiable proof of the historical list's authenticity.

```json
{
  "schemaVersion": 1,
  "accountId": "123456",
  "capturedAt": "2026-01-01T12:00:00.000Z",
  "complete": true,
  "followers": [],
  "following": []
}
```

Each account has string `id`, `username`, `full_name`, `profile_pic_url` fields and optional boolean `is_private` / `is_verified` flags. Timestamps use UTC ISO 8601 with seconds and optional three-digit milliseconds. Arrays contain every account in the corresponding complete list; empty arrays are valid only for genuinely empty lists. Current and previous complete snapshots are local under `iu_history_<accountId>`. Only these two snapshots are retained automatically; export milestones if needed. Failed jobs never rotate them. Export files, browser test profiles, dependencies, local tooling and Apple metadata files are ignored by Git. Keep personal exports out of commits. The extension has no telemetry, model service, external messaging or public extension resources. A compatible agent may send tool results to its model provider under that agent's own privacy settings.

## Development and verification

```sh
npm test
npm run typecheck
npm run build
npm run package
```

Focused tests cover pagination failures, timeout/cancellation, history preservation and comparison, schemas/lifecycle, sender/message validation, interruption reconciliation and mutation authorization. [VERIFICATION.md](VERIFICATION.md) records source tests, installed-extension/native tests and remaining live-agent blockers separately. `tests/browser-smoke.cjs` uses an existing Playwright installation plus a Chrome for Testing binary and synthetic Instagram responses; it never logs into Instagram or sends real unfollows. The existing Sass loader emits a deprecation warning; it does not prevent builds.

MIT licensed; see [LICENSE](LICENSE).
