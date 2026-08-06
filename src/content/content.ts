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

const MAX_FETCH_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 5;

async function doScan(): Promise<void> {
  const ac = new AbortController();
  scanAbortController = ac;

  // Validate we have the required Instagram cookie
  const dsUserId = getCookie("ds_user_id");
  if (!dsUserId) {
    await persistState({
      status: "idle",
      percentage: 0,
      results: [],
    });
    console.error(
      "[IU] Cannot scan: ds_user_id cookie not found. Are you logged into Instagram?"
    );
    return;
  }

  const loadedTimings = await loadTimings();
  const timings = loadedTimings ?? {
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
  let consecutiveFailures = 0;

  await persistState({ status: "scanning", percentage: 0, results: [] });

  while (hasNext) {
    if (ac.signal.aborted) {
      await persistState({ status: "idle" });
      return;
    }

    let receivedData: User | undefined;
    let fetchSucceeded = false;

    for (let retry = 0; retry < MAX_FETCH_RETRIES; retry++) {
      if (ac.signal.aborted) {
        await persistState({ status: "idle" });
        return;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error(
            `[IU] Fetch HTTP ${response.status} (attempt ${retry + 1}/${MAX_FETCH_RETRIES})`
          );
          await sleep(2000 * (retry + 1)); // Exponential backoff
          continue;
        }

        const json = await response.json();
        receivedData = json.data?.user?.edge_follow;
        if (!receivedData) {
          console.error(
            `[IU] Unexpected API response structure (attempt ${retry + 1}/${MAX_FETCH_RETRIES})`
          );
          await sleep(2000 * (retry + 1));
          continue;
        }

        fetchSucceeded = true;
        break;
      } catch (e) {
        console.error(
          `[IU] Fetch error (attempt ${retry + 1}/${MAX_FETCH_RETRIES}):`,
          e
        );
        await sleep(2000 * (retry + 1));
      }
    }

    if (!fetchSucceeded || !receivedData) {
      consecutiveFailures++;
      console.error(
        `[IU] Scan fetch failed after ${MAX_FETCH_RETRIES} retries (consecutive failures: ${consecutiveFailures})`
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await persistState({
          status: "idle",
          percentage: Math.round(
            totalFollowedUsersCount > 0
              ? (currentFollowedUsersCount / totalFollowedUsersCount) * 100
              : 0
          ),
        });
        console.error(
          "[IU] Scan aborted after too many consecutive failures. Try again later."
        );
        scanAbortController = null;
        return;
      }

      // Wait longer before trying the next page
      await sleep(15000);
      continue;
    }

    consecutiveFailures = 0; // Reset on success

    if (totalFollowedUsersCount === -1) {
      totalFollowedUsersCount = receivedData.count;
    }

    hasNext = receivedData.page_info.has_next_page;
    url = urlGenerator(getCookie, receivedData.page_info.end_cursor);
    currentFollowedUsersCount += receivedData.edges.length;
    receivedData.edges.forEach((x) => results.push(x.node));

    const percentage = Math.round(
      totalFollowedUsersCount > 0
        ? (currentFollowedUsersCount / totalFollowedUsersCount) * 100
        : 0
    );

    await persistState({ percentage, results });

    // Pause handling
    while (scanningPaused && !ac.signal.aborted) {
      await sleep(1000);
    }
    if (ac.signal.aborted) return;

    // Micro-pause between fetches (500–2000ms random jitter)
    const microPause = Math.floor(Math.random() * 1500) + 500;
    await sleep(microPause);

    // Standard delay between cycles: timings.timeBetweenSearchCycles + up to 30% jitter
    await sleep(
      timings.timeBetweenSearchCycles +
        Math.floor(Math.random() * timings.timeBetweenSearchCycles * 0.3)
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
    await persistState({ status: "idle" });
    console.error("[IU] Cannot unfollow: csrftoken cookie not found");
    return;
  }

  const loadedTimings = await loadTimings();
  const timings = loadedTimings ?? {
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
    const percentage = Math.round(
      users.length > 0 ? (counter / users.length) * 100 : 0
    );

    try {
      const response = await fetch(unfollowUserUrlGenerator(user.id), {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-csrftoken": csrftoken,
        },
        method: "POST",
        mode: "cors",
        credentials: "include",
      });
      unfollowLog.push({
        user,
        unfollowedSuccessfully: response.ok,
      });
    } catch (e) {
      console.error("[IU] Unfollow error:", e);
      unfollowLog.push({ user, unfollowedSuccessfully: false });
    }

    await persistState({ percentage, unfollowLog, status: "unfollowing" });

    // Skip delay on last user
    if (user === users[users.length - 1]) break;

    // Delay between unfollows: timings.timeBetweenUnfollows + up to 20% jitter
    await sleep(
      timings.timeBetweenUnfollows +
        Math.floor(Math.random() * timings.timeBetweenUnfollows * 0.2)
    );

    if (counter % 5 === 0) {
      console.info(
        `[IU] Sleeping ${Math.round(timings.timeToWaitAfterFiveUnfollows / 60000)} min to prevent rate limiting`
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
    try {
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
    } catch (e) {
      console.error("[IU] Message handler error:", e);
      await persistState({ status: "idle" });
      sendResponse({ error: e instanceof Error ? e.message : "Internal error" });
    }
  })();

  return true; // Keep message channel open for async response
});

// ── Init ───────────────────────────────────────────────────────────────────

console.info("[IU] Content script loaded on Instagram");
