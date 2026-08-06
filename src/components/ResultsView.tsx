import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { AppStorageState } from "../messages";
import type { UserNode } from "../model/user";
import type { ScanningFilter } from "../model/scanning-filter";
import { loadWhitelist, saveWhitelist } from "../utils/storage";
import { WITHOUT_PROFILE_PICTURE_URL_IDS } from "../constants/constants";

interface Props {
  state: AppStorageState;
  updateState: (p: Partial<AppStorageState>) => void;
  onUnfollow: (userIds: string[]) => void;
  isUnfollowing: boolean;
  isDone: boolean;
}

function hasNoPic(user: UserNode): boolean {
  return WITHOUT_PROFILE_PICTURE_URL_IDS.some((id) => user.profile_pic_url.includes(id));
}

export const ResultsView = ({ state, updateState, onUnfollow, isUnfollowing, isDone }: Props) => {
  const [localSearch, setLocalSearch] = useState(state.searchTerm);
  const [whitelist, setWhitelist] = useState<UserNode[]>([]);

  // Load whitelist on mount and when results change (whitelist may have been modified externally)
  useEffect(() => {
    loadWhitelist().then(setWhitelist);
  }, []);

  const whitelistIds = useMemo(() => new Set(whitelist.map((u) => u.id)), [whitelist]);
  const selectedSet = useMemo(() => new Set(state.selectedIds), [state.selectedIds]);

  const displayed = useMemo(() => {
    const term = localSearch.toLowerCase();
    return state.results.filter((r) => {
      if (state.currentTab === "non_whitelisted" && whitelistIds.has(r.id)) return false;
      if (state.currentTab === "whitelisted" && !whitelistIds.has(r.id)) return false;
      if (!state.filter.showPrivate && r.is_private) return false;
      if (!state.filter.showVerified && r.is_verified) return false;
      if (!state.filter.showFollowers && r.follows_viewer) return false;
      if (!state.filter.showNonFollowers && !r.follows_viewer) return false;
      if (!state.filter.showWithOutProfilePicture && hasNoPic(r)) return false;
      if (term && !r.username.toLowerCase().includes(term) && !r.full_name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [state.results, state.filter, state.currentTab, localSearch, whitelistIds]);

  const toggleUser = (userId: string) => {
    if (selectedSet.has(userId)) updateState({ selectedIds: state.selectedIds.filter((id) => id !== userId) });
    else updateState({ selectedIds: [...state.selectedIds, userId] });
  };

  const toggleAll = () => {
    const displayedIds = new Set(displayed.map((u) => u.id));
    const allSelected = displayed.every((u) => selectedSet.has(u.id));
    if (allSelected) updateState({ selectedIds: state.selectedIds.filter((id) => !displayedIds.has(id)) });
    else {
      const toAdd = displayed.filter((u) => !selectedSet.has(u.id)).map((u) => u.id);
      updateState({ selectedIds: [...state.selectedIds, ...toAdd] });
    }
  };

  const quickSelect = (pred: (u: UserNode) => boolean) => {
    const matching = displayed.filter(pred);
    const matchingIds = new Set(matching.map((u) => u.id));
    updateState({ selectedIds: [...state.selectedIds.filter((id) => !matchingIds.has(id)), ...matching.filter((u) => !selectedSet.has(u.id)).map((u) => u.id)] });
  };

  const toggleWhitelist = useCallback((user: UserNode) => {
    const updated = whitelistIds.has(user.id)
      ? whitelist.filter((w) => w.id !== user.id)
      : [...whitelist, user];
    setWhitelist(updated);
    saveWhitelist(updated);
  }, [whitelist, whitelistIds]);

  const filter = state.filter;
  const filters: [keyof ScanningFilter, string, boolean][] = [
    ["showNonFollowers", "Non-followers", filter.showNonFollowers],
    ["showFollowers", "Followers", filter.showFollowers],
    ["showVerified", "Verified", filter.showVerified],
    ["showPrivate", "Private", filter.showPrivate],
    ["showWithOutProfilePicture", "No pic", filter.showWithOutProfilePicture],
  ];

  const toggleFilter = (key: keyof ScanningFilter) => {
    if (state.selectedIds.length > 0 && !confirm("Changing filters will clear selection.")) return;
    updateState({ selectedIds: [], filter: { ...state.filter, [key]: !state.filter[key] } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      {/* Search */}
      <div style={{ display: "flex", gap: 8 }}>
        <input className="search-input" placeholder="Search by name or username…" value={localSearch}
          onChange={(e) => { setLocalSearch((e.target as HTMLInputElement).value); updateState({ searchTerm: (e.target as HTMLInputElement).value }); }} />
      </div>

      <div className="filter-bar">
        <div className="tab-bar" style={{ border: "none", padding: 0, flexShrink: 0 }}>
          <button className={`tab ${state.currentTab === "non_whitelisted" ? "active" : ""}`} onClick={() => updateState({ currentTab: "non_whitelisted", page: 1 })}>All</button>
          <button className={`tab ${state.currentTab === "whitelisted" ? "active" : ""}`} onClick={() => updateState({ currentTab: "whitelisted", page: 1 })}>★ Whitelist</button>
        </div>
        <div style={{ width: 1, background: "var(--border, #27272a)", alignSelf: "stretch", margin: "2px 0" }} />
        {filters.map(([key, label, active]) => (
          <button key={key} className={`filter-chip ${active ? "active" : ""}`} onClick={() => toggleFilter(key)}>{label}</button>
        ))}
      </div>

      {/* Selection bar */}
      {state.selectedIds.length > 0 && !isUnfollowing && (
        <div className="selection-bar">
          <span className="sel-count">{state.selectedIds.length} selected</span>
          <div className="sel-actions">
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => quickSelect((u) => u.is_verified)}>+ Verified</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => quickSelect((u) => u.is_private)}>+ Private</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => quickSelect((u) => hasNoPic(u))}>+ No Pic</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: "#ef4444" }} onClick={() => updateState({ selectedIds: [] })}>Clear</button>
            <button className="btn btn-danger" style={{ fontSize: 11, padding: "4px 12px" }}
              onClick={() => { if (confirm(`Unfollow ${state.selectedIds.length} users?`)) onUnfollow(state.selectedIds); }}>
              Unfollow {state.selectedIds.length}
            </button>
          </div>
        </div>
      )}

      {/* Select all */}
      {displayed.length > 0 && !isUnfollowing && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
          <input type="checkbox" className="user-checkbox" checked={displayed.length > 0 && displayed.every((u) => selectedSet.has(u.id))} onChange={toggleAll} />
          <span style={{ fontSize: 12, color: "var(--text-secondary, #a1a1aa)", cursor: "pointer" }} onClick={toggleAll}>
            {displayed.every((u) => selectedSet.has(u.id)) ? "Deselect all" : "Select all"} ({displayed.length})
          </span>
        </div>
      )}

      {/* User list */}
      <div className="user-list" style={{ flex: 1 }}>
        {displayed.map((user) => (
          <div key={user.id} className={`user-row ${selectedSet.has(user.id) ? "selected" : ""}`} onClick={() => toggleUser(user.id)}>
            <input type="checkbox" className="user-checkbox" checked={selectedSet.has(user.id)} onChange={() => toggleUser(user.id)} onClick={(e) => e.stopPropagation()} />
            <img className="user-avatar" src={user.profile_pic_url} alt={user.username} />
            <div className="user-info">
              <div className="user-name">@{user.username}</div>
              <div className="user-fullname">{user.full_name}</div>
            </div>
            <div className="user-badges">
              {user.is_verified && <span className="badge-pill badge-pill-verified">✓</span>}
              {user.is_private && <span className="badge-pill badge-pill-private">🔒</span>}
              {user.follows_viewer && <span className="badge-pill badge-pill-follows">⇄</span>}
            </div>
            <button className={`user-whitelist-btn ${whitelistIds.has(user.id) ? "active" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleWhitelist(user); }}
              title={whitelistIds.has(user.id) ? "Remove from whitelist" : "Add to whitelist"}>
              {whitelistIds.has(user.id) ? "★" : "☆"}
            </button>
          </div>
        ))}
        {displayed.length === 0 && !isUnfollowing && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No users match</div>
            <div className="empty-desc">Try adjusting your filters or search term.</div>
          </div>
        )}
      </div>

      {/* Unfollow progress */}
      {isUnfollowing && (
        <div>
          <div className="progress-wrap"><div className="progress-fill" style={{ width: `${state.percentage}%` }} /></div>
          <div className="progress-label"><span>Unfollowing…</span><span className="pct">{state.percentage}%</span></div>
          <div className="log-list" style={{ marginTop: 8 }}>
            {state.unfollowLog.slice(-20).reverse().map((entry, i) => (
              <div key={i} className={`log-entry ${entry.unfollowedSuccessfully ? "success" : "error"}`}>
                <span className="log-icon">{entry.unfollowedSuccessfully ? "✓" : "✗"}</span>
                <span className="log-user">@{entry.user.username}</span>
                <span className="log-status">{entry.unfollowedSuccessfully ? "Unfollowed" : "Failed"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done */}
      {isDone && (
        <div className="empty-state" style={{ padding: "24px" }}>
          <div className="empty-icon">✅</div>
          <div className="empty-title">All done</div>
          <div className="empty-desc">
            Unfollowed {state.unfollowLog.filter((e) => e.unfollowedSuccessfully).length} of {state.unfollowLog.length} users.
          </div>
        </div>
      )}
    </div>
  );
};
