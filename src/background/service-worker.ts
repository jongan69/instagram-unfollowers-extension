/**
 * Background service worker.
 * Handles extension icon click → open dedicated app window.
 * Manages window lifecycle so clicking the icon re-focuses existing window.
 */

let appWindowId: number | undefined;

chrome.action.onClicked.addListener(async () => {
  // If app window already exists, focus it
  if (appWindowId !== undefined) {
    try {
      await chrome.windows.update(appWindowId, { focused: true });
      return;
    } catch {
      appWindowId = undefined;
    }
  }

  const win = await chrome.windows.create({
    url: "popup.html",
    type: "popup",
    width: 850,
    height: 700,
  });

  if (win.id) {
    appWindowId = win.id;
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === appWindowId) {
    appWindowId = undefined;
  }
});

// Service worker keeps alive
console.info("[IU] Service worker started");
