## 1.1.0

- Validate complete follower/following pagination and stable IDs; preserve history on errors and cancellation.
- Separate current nonfollowers from earlier follower IDs now absent; keep causes inconclusive.
- Add optional native WebMCP on an extension-owned Agent / Review tab, strict tools, job status and reload recovery.
- Require exact-list approval, relationship rechecks, pacing and verification for cleanup; disable direct batch mutation.
- Add local baseline import/export, status/setup guidance, focused tests and installed native API smoke verification.
- Actual natural-language agent invocation and logged-in Instagram endpoint compatibility remain unverified; see VERIFICATION.md.

# Changelog

## [1.0.1] - 2025-08-06

### Changed
- **Switched to dropdown popup** — the extension now opens as a standard Chrome toolbar dropdown instead of a separate window
- **Moved all storage to `chrome.storage.local`** — timings and whitelist now persist properly across extension restarts and are accessible from both the popup and content script

### Fixed
- **Infinite loop on scan failure** — fetch errors now retry with exponential backoff and abort after 5 consecutive failures instead of looping forever
- **Missing cookie check** — scan now validates `ds_user_id` cookie exists before starting, avoiding malformed GraphQL requests
- **Timing settings had no effect** — rate-limit configuration from the Settings tab now actually applies to scan and unfollow operations
- **Unhandled promise rejection** — the content script message handler now has proper error handling that reports failures back to the popup
- **Silent unfollow crash** — missing `csrftoken` cookie no longer causes an unhandled error; it reports cleanly instead
- **Unused import** — removed dead `UnfollowView` import that broke the build

## [1.0.0] - 2025-08-06

### Added
- Initial release
- GraphQL-based follower scanning via Instagram's API
- Identify users who don't follow you back
- Batch unfollow with configurable rate limiting
- Whitelist support (add/remove/export/import)
- Advanced filtering (followers, non-followers, verified, private, no profile picture)
- Search by username or full name
- Paginated results (50 per page)
- Configurable timing settings for rate limit protection
- Dark-themed UI with Preact and SCSS
- Chrome Extension Manifest V3
- Privacy-first design — all data stays local
