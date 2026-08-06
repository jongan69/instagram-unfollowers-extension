import React from "react";
import type { UserNode } from "../model/user";
import type { AppStorageState } from "../messages";
import { loadWhitelist } from "../utils/storage";
import {
  getCurrentPageUnfollowers,
  getMaxPage,
  getUsersForDisplay,
  isWithoutProfilePicture,
  assertUnreachable,
} from "../utils/utils";
import {
  WHITELISTED_RESULTS_STORAGE_KEY,
} from "../constants/constants";
import { UserCheckIcon, UserUncheckIcon } from "./icons/Icons";

interface SearchingProps {
  state: AppStorageState;
  updateState: (patch: Partial<AppStorageState>) => void;
  scanningPaused: boolean;
  onPauseToggle: () => void;
}

export const Searching = ({
  state,
  updateState,
  scanningPaused,
  onPauseToggle,
}: SearchingProps) => {
  const whitelist = loadWhitelist();
  const usersForDisplay = getUsersForDisplay(
    state.results,
    whitelist,
    state.currentTab,
    state.searchTerm,
    state.filter
  );
  const selectedSet = new Set(state.selectedIds);

  let currentLetter = "";
  const onNewLetter = (firstLetter: string) => (
    <div className="alphabet-character" key={`letter-${firstLetter}`}>
      {firstLetter}
    </div>
  );

  const toggleUser = (userId: string) => {
    if (selectedSet.has(userId)) {
      updateState({ selectedIds: state.selectedIds.filter((id) => id !== userId) });
    } else {
      updateState({ selectedIds: [...state.selectedIds, userId] });
    }
  };

  const handleWhitelistAction = () => {
    const selectedUsers = state.results.filter((u) => selectedSet.has(u.id));
    if (selectedUsers.length === 0) return;

    let updated: UserNode[];
    if (state.currentTab === "non_whitelisted") {
      const existingIds = new Set(whitelist.map((u) => u.id));
      const toAdd = selectedUsers.filter((u) => !existingIds.has(u.id));
      updated = [...whitelist, ...toAdd];
    } else {
      updated = whitelist.filter((u) => !selectedSet.has(u.id));
    }
    localStorage.setItem(WHITELISTED_RESULTS_STORAGE_KEY, JSON.stringify(updated));
    updateState({ selectedIds: [] });
    // Force refresh whitelist display
  };

  const quickSelect = (predicate: (u: UserNode) => boolean) => {
    const matching = usersForDisplay.filter(predicate);
    const matchingIds = new Set(matching.map((u) => u.id));
    const newIds = [
      ...state.selectedIds.filter((id) => !matchingIds.has(id)),
      ...matching.filter((u) => !selectedSet.has(u.id)).map((u) => u.id),
    ];
    updateState({ selectedIds: newIds });
  };

  return (
    <section className="workspace-layout">
      <aside className="app-sidebar">
        <div className="sidebar-content">
          <div className="panel-heading">
            <span>Scanner</span>
            <strong>{state.percentage}%</strong>
          </div>

          <menu className="sidebar-filters-grid">
            <p>Filter</p>
            {[
              ["showNonFollowers", "Non-Followers"],
              ["showFollowers", "Followers"],
              ["showVerified", "Verified"],
              ["showPrivate", "Private"],
              ["showWithOutProfilePicture", "No Pic"],
            ].map(([key, label]) => (
              <label className="badge m-small" key={key}>
                <input
                  type="checkbox"
                  checked={(state.filter as any)[key] as boolean}
                  onChange={() => {
                    if (state.selectedIds.length > 0) {
                      if (!confirm("Changing filters will clear selected users")) {
                        return;
                      }
                    }
                    updateState({
                      selectedIds: [],
                      filter: { ...state.filter, [key]: !(state.filter as any)[key] },
                    });
                  }}
                />
                &nbsp;{label}
              </label>
            ))}
          </menu>

          <div className="sidebar-buttons-grid">
            <button className="button-secondary" onClick={() => quickSelect((u) => u.is_verified)}>
              Verified
            </button>
            <button className="button-secondary" onClick={() => quickSelect((u) => u.is_private)}>
              Private
            </button>
            <button className="button-secondary" onClick={() => quickSelect((u) => isWithoutProfilePicture(u))}>
              No Pic
            </button>
            <button className="button-secondary danger-text" onClick={() => updateState({ selectedIds: [] })}>
              Clear
            </button>
          </div>

          {state.selectedIds.length > 0 && (
            <button className="button-secondary sidebar-whitelist-action" onClick={handleWhitelistAction}>
              {state.currentTab === "non_whitelisted" ? "Whitelist" : "Unwhitelist"} Selected ({state.selectedIds.length})
            </button>
          )}

          <div className="metric-stack">
            <p><span>Displayed</span><strong>{usersForDisplay.length}</strong></p>
            <p><span>Total scanned</span><strong>{state.results.length}</strong></p>
            <p className="whitelist-counter">
              <span>Whitelisted</span><strong>★ {whitelist.length}</strong>
            </p>
          </div>

          {state.percentage === 100 && (
            <div className="sidebar-summary">
              <h4>Scan Summary</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <span>Non-Followers</span>
                  <strong>{state.results.filter((u) => !u.follows_viewer).length}</strong>
                </div>
                <div className="summary-item">
                  <span>Verified</span>
                  <strong>{state.results.filter((u) => u.is_verified).length}</strong>
                </div>
                <div className="summary-item">
                  <span>Private</span>
                  <strong>{state.results.filter((u) => u.is_private).length}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-footer-controls">
            <button className="button-secondary button-pause" onClick={onPauseToggle}>
              {scanningPaused ? "Resume" : "Pause"}
            </button>
            <div className="sidebar-pagination">
              <div className="pagination-controls">
                <a onClick={() => { if (state.page > 1) updateState({ page: state.page - 1 }); }}>❮</a>
                <span>{state.page}/{getMaxPage(usersForDisplay)}</span>
                <a onClick={() => { if (state.page < getMaxPage(usersForDisplay)) updateState({ page: state.page + 1 }); }}>❯</a>
              </div>
            </div>
          </div>
        </div>

        <button
          className="unfollow"
          disabled={state.selectedIds.length === 0}
          onClick={() => {
            if (!confirm("Are you sure you want to unfollow these users?")) return;
            if (state.selectedIds.length === 0) {
              alert("Must select at least a single user to unfollow");
              return;
            }
            // Send unfollow command to content script
            const tabs = chrome.tabs.query({ url: "*://www.instagram.com/*" });
            tabs.then(([tab]) => {
              if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "START_UNFOLLOW",
                  userIds: state.selectedIds,
                });
              }
            });
          }}
        >
          Unfollow ({state.selectedIds.length})
        </button>
      </aside>

      <article className="results-container">
        <nav className="tabs-container">
          <button
            type="button"
            className={`tab ${state.currentTab === "non_whitelisted" ? "tab-active" : ""}`}
            onClick={() => updateState({ currentTab: "non_whitelisted", page: 1 })}
          >
            Non-Whitelisted
          </button>
          <button
            type="button"
            className={`tab ${state.currentTab === "whitelisted" ? "tab-active" : ""}`}
            onClick={() => updateState({ currentTab: "whitelisted", page: 1 })}
          >
            Whitelisted
          </button>
        </nav>

        {getCurrentPageUnfollowers(usersForDisplay, state.page).map((user) => {
          const firstLetter = user.username.substring(0, 1).toUpperCase();
          const letterHeader =
            firstLetter !== currentLetter ? onNewLetter(firstLetter) : null;
          currentLetter = firstLetter;

          return (
            <React.Fragment key={user.id}>
              {letterHeader}
              <label className="result-item">
                <div className="flex grow align-center">
                  <div
                    className="avatar-container"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const updatedWhitelist =
                        state.currentTab === "non_whitelisted"
                          ? [...whitelist, user]
                          : whitelist.filter((w) => w.id !== user.id);
                      localStorage.setItem(
                        WHITELISTED_RESULTS_STORAGE_KEY,
                        JSON.stringify(updatedWhitelist)
                      );
                    }}
                  >
                    <img className="avatar" alt={user.username} src={user.profile_pic_url} />
                    <span className="avatar-icon-overlay-container">
                      {state.currentTab === "non_whitelisted" ? <UserCheckIcon /> : <UserUncheckIcon />}
                    </span>
                  </div>
                  <div className="flex column m-medium" style={{ flex: 1 }}>
                    <a
                      className="fs-xlarge"
                      target="_blank"
                      href={`https://www.instagram.com/${user.username}`}
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user.username}
                    </a>
                    <span className="fs-medium">{user.full_name}</span>
                  </div>
                  {user.is_verified && <div className="verified-badge">✔</div>}
                  {user.is_private && (
                    <div className="flex justify-center w-100">
                      <span className="private-indicator">Private</span>
                    </div>
                  )}
                </div>
                <div className="flex align-center gap-small">
                  <input
                    className="account-checkbox"
                    type="checkbox"
                    checked={selectedSet.has(user.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleUser(user.id);
                    }}
                  />
                </div>
              </label>
            </React.Fragment>
          );
        })}
      </article>
    </section>
  );
};
