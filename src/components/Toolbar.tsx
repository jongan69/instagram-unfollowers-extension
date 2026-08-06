import React, { useState } from "react";
import type { AppStorageState } from "../messages";
import type { Timings } from "../model/timings";
import type { UserNode } from "../model/user";
import { SettingMenu } from "./SettingMenu";
import { SettingIcon, Logo } from "./icons/Icons";
import { copyListToClipboard, exportToCSV, exportToJSON, getUsersForDisplay } from "../utils/utils";
import { loadWhitelist } from "../utils/storage";

interface ToolbarProps {
  state: AppStorageState;
  updateState: (patch: Partial<AppStorageState>) => void;
  currentTimings: Timings;
  setTimings: (t: Timings) => void;
  onWhitelistUpdate: (users: readonly UserNode[]) => void;
  onReset: () => void;
  toggleAllUsers: () => void;
  toggleCurrentPageUsers: () => void;
}

export const Toolbar = ({
  state,
  updateState,
  currentTimings,
  setTimings,
  onWhitelistUpdate,
  onReset,
  toggleAllUsers,
  toggleCurrentPageUsers,
}: ToolbarProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const whitelist = loadWhitelist();

  const displayed =
    state.status === "scanning" || state.status === "scanning_done"
      ? getUsersForDisplay(state.results, whitelist, state.currentTab, state.searchTerm, state.filter)
      : [];

  const isActive = state.status === "scanning" || state.status === "unfollowing";

  return (
    <>
      <header className="app-header">
        {isActive && (
          <div
            className="progressbar"
            style={{ "--progress-width": `${state.percentage}%` } as React.CSSProperties}
          />
        )}
        <div className="app-header-content">
          <div className="logo" onClick={onReset}>
            <Logo />
            <div className="logo-text">
              <span>Instagram</span>
              <span>Unfollowers</span>
            </div>
          </div>

          <div className="toolbar-actions">
            <button
              className="copy-list"
              disabled={state.status === "idle"}
              onClick={() => copyListToClipboard(displayed)}
            >
              Copy
            </button>
            <button
              className="copy-list"
              disabled={state.status !== "scanning" && state.status !== "scanning_done"}
              onClick={() => exportToJSON(displayed)}
            >
              JSON
            </button>
            <button
              className="copy-list"
              disabled={state.status !== "scanning" && state.status !== "scanning_done"}
              onClick={() => exportToCSV(displayed)}
            >
              CSV
            </button>
            <button className="icon-button" onClick={() => setSettingsOpen(true)}>
              <SettingIcon />
            </button>
          </div>

          <div className="toolbar-search">
            <input
              type="text"
              className="search-bar"
              placeholder="Search users"
              disabled={state.status === "idle"}
              value={state.searchTerm}
              onChange={(e) => updateState({ searchTerm: (e.target as HTMLInputElement).value })}
            />
          </div>
        </div>
      </header>

      {settingsOpen && (
        <SettingMenu
          setSettingState={setSettingsOpen}
          currentTimings={currentTimings}
          setTimings={setTimings}
          whitelistedUsers={whitelist}
          onWhitelistUpdate={onWhitelistUpdate}
        />
      )}
    </>
  );
};
