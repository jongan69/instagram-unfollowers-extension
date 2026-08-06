import React from "react";
import type { AppStorageState } from "../messages";

interface Props {
  state: AppStorageState;
  updateState: (p: Partial<AppStorageState>) => void;
  onUnfollow: (userIds: string[]) => void;
  isUnfollowing: boolean;
  isDone: boolean;
}

// Wrapper — delegates to ResultsView which handles both results + unfollow states
// This file kept for compatibility; the unfollow UI is now integrated into ResultsView
export { ResultsView as UnfollowView } from "./ResultsView";
