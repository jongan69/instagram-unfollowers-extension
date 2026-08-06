import type { UserNode } from "./user";
import type { ScanningTab } from "./scanning-tab";
import type { ScanningFilter } from "./scanning-filter";
import type { UnfollowLogEntry } from "./unfollow-log-entry";

export type AppStatus =
  | "idle"
  | "scanning"
  | "paused"
  | "scanning_done"
  | "unfollowing"
  | "done";

export interface StoredState {
  status: AppStatus;
  percentage: number;
  results: UserNode[];
  selectedIds: string[];
  unfollowLog: UnfollowLogEntry[];
  filter: ScanningFilter;
  currentTab: ScanningTab;
  searchTerm: string;
  page: number;
}

export function defaultStoredState(): StoredState {
  return {
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
}
