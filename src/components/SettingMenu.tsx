import React, { useState } from "react";
import type { Timings } from "../model/timings";
import type { UserNode } from "../model/user";
import { WhitelistManager } from "./WhitelistManager";

interface SettingMenuProps {
  setSettingState: (open: boolean) => void;
  currentTimings: Timings;
  setTimings: (t: Timings) => void;
  whitelistedUsers: readonly UserNode[];
  onWhitelistUpdate: (users: readonly UserNode[]) => void;
}

export const SettingMenu = ({
  setSettingState,
  currentTimings,
  setTimings,
  whitelistedUsers,
  onWhitelistUpdate,
}: SettingMenuProps) => {
  const [searchCycles, setSearchCycles] = useState(currentTimings.timeBetweenSearchCycles);
  const [fiveSearchCycles, setFiveSearchCycles] = useState(currentTimings.timeToWaitAfterFiveSearchCycles);
  const [timeBetweenUnfollows, setTimeBetweenUnfollows] = useState(currentTimings.timeBetweenUnfollows);
  const [timeAfterFiveUnfollows, setTimeAfterFiveUnfollows] = useState(currentTimings.timeToWaitAfterFiveUnfollows);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setTimings({
      timeBetweenSearchCycles: searchCycles,
      timeToWaitAfterFiveSearchCycles: fiveSearchCycles,
      timeBetweenUnfollows,
      timeToWaitAfterFiveUnfollows: timeAfterFiveUnfollows,
    });
    setSettingState(false);
  };

  return (
    <form onSubmit={handleSave}>
      <div className="backdrop" onClick={() => setSettingState(false)}>
        <div className="setting-menu" onClick={(e) => e.stopPropagation()}>
          <div className="settings-module">
            <div className="module-header">
              <h3>Settings</h3>
            </div>
            <div className="settings-content">
              {[
                ["Default time between search cycles", searchCycles, setSearchCycles, 500],
                ["Default time to wait after five search cycles", fiveSearchCycles, setFiveSearchCycles, 4000],
                ["Default time between unfollows", timeBetweenUnfollows, setTimeBetweenUnfollows, 1000],
                ["Default time to wait after five unfollows", timeAfterFiveUnfollows, setTimeAfterFiveUnfollows, 70000],
              ].map(([label, value, setter, min]) => (
                <div className="row" key={label as string}>
                  <label className="minimun-width">{label}</label>
                  <input
                    type="number"
                    min={min as number}
                    max={999999}
                    value={value as number}
                    onChange={(e) => (setter as Function)(Number((e.target as HTMLInputElement).value))}
                  />
                  <label className="margin-between-input-and-label">(ms)</label>
                </div>
              ))}
              <div className="warning-container">
                <h3 className="warning">
                  <b>WARNING:</b> Modifying these settings can lead to your account being banned.
                </h3>
                <h3 className="warning">USE IT AT YOUR OWN RISK!!!!</h3>
              </div>
            </div>
          </div>

          <hr className="module-divider" />

          <div className="whitelist-module">
            <WhitelistManager
              whitelistedUsers={whitelistedUsers}
              onWhitelistUpdate={onWhitelistUpdate}
            />
          </div>

          <div className="btn-container">
            <button className="btn" type="button" onClick={() => setSettingState(false)}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Save
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};
