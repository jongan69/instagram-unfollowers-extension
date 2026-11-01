# Instagram Unfollowers

A local Chrome extension for complete relationship snapshots, current nonfollowers, history comparison and deliberate cleanup. v1.2.0 replaces the obsolete GraphQL list hashes with Instagram's native REST relationship interface and adds a responsive review workbench. Optional native WebMCP tools share the same extension-owned logic as the UI.

## Install or update

Requires Node.js 22+ and npm. Uses the existing TypeScript, Preact and webpack toolchain.

```sh
git clone https://github.com/jongan69/instagram-unfollowers-extension.git
cd instagram-unfollowers-extension
git switch dev
npm ci
npm run verify
npm run package
```

1. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`.
2. Sign into Instagram, open **your own profile**, and refresh it. Keep this profile tab open during scanning. If a console-injected tool replaced Instagram's page, finish/stop that tool and refresh first; do not run competing scanners.
3. Open the extension → **Open Agent / Review**. A ready profile and exact totals enable **Start complete scan**.
4. Wait for a complete result. The workbench displays the phase, loaded/expected accounts, snapshot time, and any actionable error. Pause, resume or cancel from the UI.
5. Review nonfollowers with search and pagination. Use **Keep** to protect useful connections. Select only reviewed candidates and enter a specific cleanup reason for each.

To update an existing unpacked installation, replace files **in the same folder**, click Reload in `chrome://extensions`, refresh Instagram, and reopen Agent / Review. Do not remove the extension or clear storage: that would discard local snapshots. Changes are on `dev`; `main` is production.

## Why this scanner differs

The [reference implementation](https://github.com/davidarroyo1234/InstagramUnfollowers), inspected at `86346ae`, migrated to:

```text
GET /api/v1/friendships/<account-id>/followers/?count=50&max_id=...
GET /api/v1/friendships/<account-id>/following/?count=50&max_id=...
```

Our adapter uses the same web app/ASBD/CSRF/XMLHttpRequest headers, stable `pk_id`/`pk` mapping and REST cursor convention. The old GraphQL list hashes, mobile-style account-info preflight and legacy web unfollow route are retired. [Third-party attribution](THIRD_PARTY_NOTICES.md) is included in the packaged extension.

We retain stronger completion rules: own-profile ownership markers, independent exact follower/following counts, stable-ID deduplication, repeated-cursor detection, malformed-response rejection, and an atomic final write of history/job/UI. A missing terminal cursor is accepted only at the exact expected count. Empty positive-count results and truncated lists fail. No partial result replaces history.

**Profile prerequisite:** counts are read from your own fully loaded profile before/after enumeration. Exact title metadata is used when a visible label is abbreviated. If exact counts, ownership markers, supported labels/layout or the expected username cannot be read, scanning is disabled with instructions. Currently count-label parsing supports Instagram's English interface. Profile totals are not an atomic server snapshot; equal-count relationship churn can still occur while scanning. Refresh the profile before each scan.

## Results and history

- **Current nonfollowers:** accounts in the complete following list whose stable IDs are absent from that snapshot's follower list. This is not a historical unfollow claim.
- **Absent earlier followers:** IDs present in the previous complete follower snapshot but absent in the new one. Voluntary unfollow, removal, deactivation and unavailability remain inconclusive causes. A username change alone is not an unfollow.
- **Unavailable or incomplete:** a 404, malformed response, changing count, stalled cursor, login challenge, network failure or rate limit never proves someone unfollowed you. The job stops visibly and preserves valid history.

The first complete scan establishes history. A second complete scan enables comparison; an imported earlier baseline can also establish the earlier point. `iu_history_<accountId>` retains the latest and previous complete snapshots. v1.0.3 following-only results cannot establish trusted follower history. Existing whitelist/settings remain local; unscoped legacy UI results are preserved separately instead of promoted to a baseline.

## Deliberate cleanup

Preserve useful tech, business, fitness and personal connections. Entertainment-only memes, celebrity clips and party promotions can be candidates after review if they do not follow back. Preserve ambiguous accounts. The extension does not objectively judge account value.

1. Select up to 50 explicitly reviewed current nonfollowers, each with a specific reason. Protected accounts cannot be selected.
2. **Prepare review list** produces exact usernames, stable IDs, reasons and the snapshot timestamp. Preparation sends no unfollows.
3. Read the list and use **Approve this exact list**. Approval is extension-owned, single-use, account/list/snapshot-bound, expires after five minutes, and is lost on host reload. Preparation expires after ten minutes. Protecting any prepared account invalidates the list.
4. Execute separately. Fresh `friendships/show_many` reads must confirm `following:true` and `followed_by:false`. The mutation uses Instagram's `usePolarisUnfollowMutation` request with current in-page session tokens; missing tokens stop before dispatch. A fresh relationship read must confirm `following:false` after each request.
5. Requests are paced, with at least four seconds between account mutations and a five-minute pause after each five. Configured larger delays are respected up to one hour. Any restriction, error, changed account or inconclusive relationship stops the queue. **Stop cleanup** cancels pending work; it cannot undo an accepted server request.

A lost response can leave an uncertain outcome. Inspect Instagram before preparing a fresh list; no automatic mutation replay occurs. Private endpoint shapes and mutation document IDs can change. No real unfollows were performed during verification.

## Rate limits and recovery

HTTP 429 and recognized feedback/action restrictions stop the job. Safe diagnostics contain only a redacted endpoint, status and Retry-After—not raw bodies, cookies or tokens. A persistent shared cooldown blocks additional starts for at least 15 minutes, or longer when instructed by Retry-After. This is a local minimum, not a promise Instagram has recovered. No endpoint rotation, IP rotation or automatic restriction retries are used. Recent legacy failures seed the cooldown on upgrade.

Status polling makes no Instagram API requests. A dispatched job survives popup/worker closure while its Instagram content host remains alive. Reloading, closing or navigating Instagram away interrupts it; status reconciliation marks it interrupted and preserves history. Switching accounts aborts pending work. Refresh/login challenges require your participation in Instagram. Never clear storage to bypass a cooldown.

## Baseline export/import and privacy

Use **Export latest complete baseline** or **Import an earlier complete baseline** in the workbench. The [v1 schema](schemas/snapshot.schema.json) requires `schemaVersion:1`, the signed-in stable `accountId`, UTC ISO `capturedAt`, `complete:true`, and `followers`/`following` arrays. Each account contains string `id`, `username`, `full_name`, `profile_pic_url`, with optional boolean privacy/verification flags.

Foreign-account, partial, malformed, duplicate-ID, impossible/future-date and too-new baseline imports are rejected. Imports are limited to 20 MB. An imported `complete:true` is your assertion; historical authenticity cannot be independently proven from an exported file.

Personal snapshots, settings, protected accounts and job diagnostics stay in extension-local storage. Export files, test profiles and local tooling are ignored by Git. There is no telemetry or model service. A separately connected browser agent may send tool results to its model provider under its own privacy settings. Tokens are read only for an authorized write and are never persisted or returned to tools. No external messaging, public extension resources or Instagram-page message bridge is exposed.

## Optional native WebMCP

The current API is `document.modelContext.registerTool(tool, {signal})`; feature detection preserves all manual controls when absent. Chrome's testing setup currently uses `chrome://flags/#enable-webmcp-testing` and a restart. The extension declares COOP/COEP isolation to avoid the reproduced Chrome 156 document.domain registration error.

Consult the [Chrome overview](https://developer.chrome.com/docs/ai/webmcp), [API guide](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools), [draft specification](https://webmachinelearning.github.io/webmcp/) and [example agent](https://github.com/GoogleChromeLabs/webmcp-extension). Your consumer must support native WebMCP on `chrome-extension://` tabs. Content-script consumers may be restricted from another extension's pages. Registration and in-page test invocation do not prove Codex, ChatGPT or another natural-language agent can invoke these tools.

| Tool | Arguments | Purpose |
|---|---|---|
| `instagram_get_status` | `{}` | Account/profile readiness, live job, cooldown, snapshots and recovery |
| `instagram_start_scan` | `{}` | Start a complete scan and return a job ID promptly |
| `instagram_get_scan_status` | `{jobId}` | Progress, completeness, timestamps, diagnostics and recovery |
| `instagram_cancel_scan` | `{jobId}` | Cancel the active scan, including requests and waits |
| `instagram_get_nonfollowers` | `{}` | Read current nonfollowers from a complete snapshot |
| `instagram_compare_snapshots` | `{}` | Compare complete follower snapshots by stable ID |
| `instagram_prepare_unfollow` | `{candidates:[{id,reason}]}` | Prepare the exact reviewed list |
| `instagram_execute_unfollow` | `{preparationId}` | Dispatch only an exact approved list; return a job ID |

Schemas reject extra properties and runtime validation repeats those checks. Registration cleanup uses AbortSignal. Cancelling while dispatch returns cancels newly started work; once a job receipt is returned, use the explicit cancel/stop control. Closing the workbench unregisters tools but does not cancel an already dispatched scan. For cleanup-job progress use `instagram_get_status().job`; use the manual Stop cleanup control to stop it.

Example prompts:

- “Check who stopped following me since my last complete scan.”
- “Show everyone I follow who does not follow me back.”
- “Prepare a cleanup list, keeping useful tech, business, fitness, and personal connections.”
- “Cancel the current scan.”

## Verification

`npm run verify` runs focused source regressions, typecheck and production build. `npm run package` creates a fresh ZIP, excludes Apple metadata and includes both license notices. Installed-browser tests cover complete paginated REST enumeration, snapshot preservation, UI review/protection, unapproved mutation rejection, cooldown, reload recovery, responsive layout and optional native tools.

```sh
CHROME_PATH=/absolute/path/to/chrome-for-testing \
PLAYWRIGHT_MODULE=/absolute/path/to/an/existing/playwright \
node tests/browser-smoke.cjs
```

Use `TEST_LEGACY_DOMAIN=1` for the Chrome 156 reproduction condition; `NO_WEBMCP=1` tests the manual fallback. These tests use only synthetic Instagram responses. [VERIFICATION.md](VERIFICATION.md) separates source tests, installed-extension tests, live website observations and remaining live-extension/agent checks. Do not equate passing fixtures with a proven production Instagram scan.

MIT licensed; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
