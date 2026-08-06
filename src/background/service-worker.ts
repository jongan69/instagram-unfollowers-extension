/**
 * Background service worker.
 * The popup opens natively via manifest.json default_popup — no window management needed.
 * This worker handles any future background tasks (notifications, alarms, etc.).
 */

console.info("[IU] Service worker started");
