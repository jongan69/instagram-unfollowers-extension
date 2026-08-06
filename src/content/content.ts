/**
 * Content script — injected into www.instagram.com.
 * Handles scanning (GraphQL follower fetching) and unfollowing (POST requests).
 * Stores all state in chrome.storage.local so the popup can always read it.
 */

import type { UserNode, User } from "../model/user";
import { getCookie, sleep, urlGenerator, unfollowUserUrlGenerator } from "../utils/utils";
import { loadTimings } from "../utils/storage";
import { DEFAULT_TIME_BETWEEN_SEARCH_CYCLES, DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES, DEFAULT_TIME_BETWEEN_UNFOLLOWS, DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS } from "../constants/constants";

import { STORAGE_KEY } from "../messages";
import type { AppStorageState } from "../messages";

// ── State ──────────────────────────────────────────────────────────────────

let currentState: AppStorageState = {
  status: "idle",
  percentage: 0,
  results: [],
  selectedIds: [],
  unfollowLog: [],
  filter: {
    showNonFollowers: true,
    showFollowers: false,
    showVerified: true,
    showPrivate: true,
    showWithOutProfilePicture: true,
  },
  currentTab: "non_whitelisted",
  searchTerm: "",
  page: 1,
};

let scanningPaused = false;
let scanAbortController: AbortController | null = null;
let unfollowAbortController: AbortController | null = null;

// ── Persistence ────────────────────────────────────────────────────────────

async function persistState(partial: Partial<AppStorageState>): Promise<void> {
  Object.assign(currentState, partial);
  await chrome.storage.local.set({ [STORAGE_KEY]: currentState });
}

async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) {
    currentState = stored[STORAGE_KEY] as AppStorageState;
  }
}

// ── Scan ───────────────────────────────────────────────────────────────────

async function doScan(): Promise<void> {
  const ac = new AbortController();
  scanAbortController = ac;

  const timings = loadTimings() ?? {
    timeBetweenSearchCycles: DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
    timeToWaitAfterFiveSearchCycles: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
    timeBetweenUnfollows: DEFAULT_TIME_BETWEEN_UNFOLLOWS,
    timeToWaitAfterFiveUnfollows: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
  };

  const results: UserNode[] = [];
  let scrollCycle = 0;
  let url = urlGenerator(getCookie);
  let hasNext = true;
  let currentFollowedUsersCount = 0;
  let totalFollowedUsersCount = -1;

  await persistState({ status: "scanning", percentage: 0, results: [] });

  while (hasNext) {
    if (ac.signal.aborted) {
      await persistState({ status: "idle" });
      return;
    }

    let receivedData: User;
    try {
      receivedData = (await fetch(url).then((res) => res.json())).data.user
        .edge_follow;
    } catch (e) {
      console.error("[IU] Fetch error:", e);
      continue;
    }

    if (totalFollowedUsersCount === -1) {
      totalFollowedUsersCount = receivedData.count;
    }

    hasNext = receivedData.page_info.has_next_page;
    url = urlGenerator(getCookie, receivedData.page_info.end_cursor);
    currentFollowedUsersCount += receivedData.edges.length;
    receivedData.edges.forEach((x) => results.push(x.node));

    const percentage = Math.round(
      (currentFollowedUsersCount / totalFollowedUsersCount) * 100
    );

    await persistState({ percentage, results });

    // Pause handling
    while (scanningPaused && !ac.signal.aborted) {
      await sleep(1000);
    }
    if (ac.signal.aborted) return;

    // Micro-pause between fetches
    const microPause = Math.floor(Math.random() * 1500) + 500;
    await sleep(microPause);

    // Standard delay between cycles
    await sleep(
      Math.floor(
        Math.random() *
          (timings.timeBetweenSearchCycles -
            timings.timeBetweenSearchCycles * 0.7)
      ) + timings.timeBetweenSearchCycles
    );

    scrollCycle++;
    if (scrollCycle > 6) {
      scrollCycle = 0;
      const longSleepVar = Math.max(
        0,
        timings.timeToWaitAfterFiveSearchCycles +
          (Math.random() * 10000 - 5000)
      );
      console.info(
        `[IU] Sleeping ${Math.round(longSleepVar / 1000)}s to prevent rate limiting`
      );
      await sleep(longSleepVar);
    }
  }

  await persistState({ percentage: 100, status: "scanning_done" });
  scanAbortController = null;
}

// ── Unfollow ───────────────────────────────────────────────────────────────

async function doUnfollow(userIds: string[]): Promise<void> {
  const ac = new AbortController();
  unfollowAbortController = ac;

  const csrftoken = getCookie("csrftoken");
  if (csrftoken === null) {
    throw new Error("csrftoken cookie is null");
  }

  const timings = loadTimings() ?? {
    timeBetweenSearchCycles: DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
    timeToWaitAfterFiveSearchCycles: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
    timeBetweenUnfollows: DEFAULT_TIME_BETWEEN_UNFOLLOWS,
    timeToWaitAfterFiveUnfollows: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
  };

  const users = currentState.results.filter((u) => userIds.includes(u.id));
  const unfollowLog = [...currentState.unfollowLog];

  let counter = 0;
  for (const user of users) {
    if (ac.signal.aborted) {
      await persistState({ status: "idle", unfollowLog });
      return;
    }

    counter += 1;
    const percentage = Math.round((counter / users.length) * 100);

    try {
      await fetch(unfollowUserUrlGenerator(user.id), {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-csrftoken": csrftoken,
        },
        method: "POST",
        mode: "cors",
        credentials: "include",
      });
      unfollowLog.push({ user, unfollowedSuccessfully: true });
    } catch (e) {
      console.error("[IU] Unfollow error:", e);
      unfollowLog.push({ user, unfollowedSuccessfully: false });
    }

    await persistState({ percentage, unfollowLog, status: "unfollowing" });

    // Skip delay on last user
    if (user === users[users.length - 1]) break;

    await sleep(
      Math.floor(
        Math.random() *
          (timings.timeBetweenUnfollows * 1.2 - timings.timeBetweenUnfollows)
      ) + timings.timeBetweenUnfollows
    );

    if (counter % 5 === 0) {
      console.info(
        `[IU] Sleeping ${timings.timeToWaitAfterFiveUnfollows / 60000} min to prevent rate limiting`
      );
      await sleep(timings.timeToWaitAfterFiveUnfollows);
    }
  }

  await persistState({ status: "done", percentage: 100 });
  unfollowAbortController = null;
}

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type: string; userIds?: string[] };

  (async () => {
    switch (msg.type) {
      case "START_SCAN": {
        await loadState();
        scanningPaused = false;
        await doScan();
        sendResponse({ success: true });
        break;
      }

      case "PAUSE_SCAN": {
        scanningPaused = true;
        sendResponse({ success: true });
        break;
      }

      case "RESUME_SCAN": {
        scanningPaused = false;
        sendResponse({ success: true });
        break;
      }

      case "START_UNFOLLOW": {
        await loadState();
        if (msg.userIds && msg.userIds.length > 0) {
          await doUnfollow(msg.userIds);
        }
        sendResponse({ success: true });
        break;
      }

      case "STOP_UNFOLLOW": {
        if (unfollowAbortController) {
          unfollowAbortController.abort();
          unfollowAbortController = null;
        }
        if (scanAbortController) {
          scanAbortController.abort();
          scanAbortController = null;
        }
        await persistState({ status: "idle" });
        sendResponse({ success: true });
        break;
      }

      case "GET_STATUS": {
        await loadState();
        sendResponse(currentState);
        break;
      }

      default:
        sendResponse({ error: "Unknown message type" });
    }
  })();

  return true; // Keep message channel open for async response
});

// ── Init ───────────────────────────────────────────────────────────────────

console.info("[IU] Content script loaded on Instagram");
