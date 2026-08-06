# Instagram Unfollowers

A Chrome extension that helps you find who doesn't follow you back on Instagram — then batch unfollow them. Scan, filter, whitelist, and manage your following list with rate-limiting protection built in.

## Features

- **Scan your following list** — Uses Instagram's own GraphQL API to fetch every account you follow
- **Identify non-followers** — Instantly see who doesn't follow you back
- **Batch unfollow** — Select multiple users and unfollow them in one go
- **Smart rate limiting** — Configurable delays between actions to avoid Instagram rate limits and bans
- **Whitelist support** — Mark accounts you want to keep following regardless; export/import whitelists as JSON
- **Advanced filtering** — Filter by followers, non-followers, verified accounts, private accounts, and users without profile pictures
- **Search** — Search by username or full name across your results
- **Privacy-first** — All data stays in your browser. Nothing is sent to external servers.
- **Dark UI** — Clean, modern dark-themed interface

## Installation

### From Source (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/jongan69/instagram-unfollowers-extension.git
   cd instagram-unfollowers-extension
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions`

4. Enable **Developer mode** (toggle in the top-right corner)

5. Click **Load unpacked** and select the `dist` folder

6. The extension icon will appear in your toolbar. Click it while on Instagram to open the app.

### From Release

1. Download the latest `instagram-unfollowers-v*.zip` from the [Releases page](https://github.com/jongan69/instagram-unfollowers-extension/releases)
2. Unzip the archive
3. Load the unzipped folder as an unpacked extension in `chrome://extensions` (Developer mode required)

## Usage

1. **Open Instagram** in Chrome (`www.instagram.com`) and log in
2. **Click the extension icon** in your toolbar — this opens the Unfollowers app
3. **Click "Start Scan"** — the extension will fetch your following list through Instagram's API. The scan speed respects Instagram's rate limits by adding delays between requests.
4. **Review results** — Switch to the Results tab to see all non-followers
5. **Filter and select** — Use the filter chips to narrow results. Select individual users or use quick-select buttons for verified/private/no-pic accounts
6. **Whitelist accounts** — Click the star (☆) next to any user to add them to your whitelist (excluded from unfollow suggestions)
7. **Unfollow** — Select the users to unfollow and click "Unfollow N"

### Settings

Configure timing values to control how aggressively the extension interacts with Instagram:

| Setting | Default | Description |
|---|---|---|
| Search cycle delay | 1,000 ms | Delay between each API page fetch |
| Cooldown after 5 cycles | 10,000 ms | Longer pause every 5 pages to avoid detection |
| Unfollow delay | 4,000 ms | Delay between each unfollow action |
| Cooldown after 5 unfollows | 300,000 ms (5 min) | Longer pause every 5 unfollows |

⚠️ **Lower values increase the risk of being rate-limited or temporarily banned.** The defaults are conservative.

## Privacy

- **All scanning happens client-side** — the extension communicates directly with Instagram's API from your browser
- **No data is sent to external servers** — your following list, whitelist, and settings are stored in Chrome's local storage
- **No analytics, no tracking, no telemetry**

## Development

### Tech Stack

- **TypeScript** — Type-safe throughout
- **Preact** — Lightweight React alternative for the popup UI (~3 KB)
- **SCSS** — Modular styling with dark theme design tokens
- **Webpack** — Bundles TypeScript, JSX, and SCSS into the `dist/` folder
- **Chrome Extension Manifest V3** — Service worker, content scripts, and storage APIs

### Scripts

```bash
npm install          # Install dependencies
npm run build        # Production build into dist/
npm run dev          # Watch mode for development
npm run clean        # Remove dist/
npm run package      # Build and create release zip
```

### Project Structure

```
src/
├── background/          # Service worker — opens the app window
│   └── service-worker.ts
├── components/          # Preact components
│   ├── ResultsView.tsx  # User list, filtering, selection, unfollow
│   ├── ScanView.tsx     # Scan initiation and progress
│   ├── SettingsView.tsx # Rate limit config and whitelist management
│   └── Toast.tsx        # Toast notification component
├── constants/           # Shared constants and defaults
│   └── constants.ts
├── content/             # Content script injected into Instagram
│   └── content.ts       # GraphQL scanning and unfollow logic
├── model/               # TypeScript interfaces and types
│   ├── scanning-filter.ts
│   ├── scanning-tab.ts
│   ├── state.ts
│   ├── timings.ts
│   ├── unfollow-filter.ts
│   ├── unfollow-log-entry.ts
│   └── user.ts
├── popup/               # Popup entry point
│   ├── index.html
│   └── popup.tsx
├── styles/              # SCSS styles
│   └── main.scss
├── utils/               # Utility functions
│   ├── storage.ts       # Whitelist and timings persistence
│   └── utils.ts         # Filtering, export, clipboard, helpers
└── messages.ts          # Message type definitions for IPC
```

## Contributing

Issues and pull requests are welcome. Before submitting a PR, please:

1. Run `npm run build` to verify the build succeeds
2. Test the extension manually with a real Instagram account (or a test account)

## License

MIT © [Jonathan Gan](https://github.com/jongan69)
