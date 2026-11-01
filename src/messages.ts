import type { UserNode } from "./model/user";
import type { ScanningTab } from "./model/scanning-tab";
import type { ScanningFilter } from "./model/scanning-filter";
import type { UnfollowLogEntry } from "./model/unfollow-log-entry";
import type { UnfollowFilter } from "./model/unfollow-filter";

// ── Popup → Content Script messages ────────────────────────────────────────

export type PopupCommand =
  | { type: "START_SCAN" }
  | { type: "PAUSE_SCAN" }
  | { type: "RESUME_SCAN" }
  | { type: "START_UNFOLLOW"; userIds: string[] }
  | { type: "STOP_UNFOLLOW" }
  | { type: "GET_STATUS" };

// ── Content Script → Popup messages ────────────────────────────────────────

export interface ScanProgressPayload {
  percentage: number;
  results: UserNode[];
}

export interface UnfollowProgressPayload {
  percentage: number;
  log: UnfollowLogEntry[];
}

export interface StatusPayload {
  status: string;
  percentage: number;
  results: UserNode[];
  selectedIds: string[];
  unfollowLog: UnfollowLogEntry[];
}

// ── Shared state (stored in chrome.storage.local) ──────────────────────────

export const STORAGE_KEY = "iu_app_state";

export interface AppStorageState {
  error?: string;
  status: string;
  percentage: number;
  results: UserNode[];
  selectedIds: string[];
  unfollowLog: UnfollowLogEntry[];
  filter: ScanningFilter;
  currentTab: ScanningTab;
  searchTerm: string;
  page: number;
}
