import React, { useState, useRef } from "react";
import type { Timings } from "../model/timings";
import type { UserNode } from "../model/user";
import { loadWhitelist, saveWhitelist, exportWhitelist, importWhitelist, clearWhitelist, mergeWhitelists } from "../utils/storage";

interface Props {
  timings: Timings;
  setTimings: (t: Timings) => void;
  onWhitelistUpdate: (users: readonly UserNode[]) => void;
}

export const SettingsView = ({ timings, setTimings, onWhitelistUpdate }: Props) => {
  const whitelist = loadWhitelist();
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, type: "success" | "error") => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  const timingFields = [
    ["Search cycle delay (ms)", timings.timeBetweenSearchCycles, (v: number) => setTimings({ ...timings, timeBetweenSearchCycles: v }), 500],
    ["Cooldown after 5 cycles (ms)", timings.timeToWaitAfterFiveSearchCycles, (v: number) => setTimings({ ...timings, timeToWaitAfterFiveSearchCycles: v }), 4000],
    ["Unfollow delay (ms)", timings.timeBetweenUnfollows, (v: number) => setTimings({ ...timings, timeBetweenUnfollows: v }), 1000],
    ["Cooldown after 5 unfollows (ms)", timings.timeToWaitAfterFiveUnfollows, (v: number) => setTimings({ ...timings, timeToWaitAfterFiveUnfollows: v }), 70000],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Timing settings */}
      <div className="settings-section">
        <div className="flex-between">
          <div className="settings-title">⏱ Rate Limit Settings</div>
          <span className="text-muted">Higher = safer</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
          {timingFields.map(([label, value, setter, min]) => (
            <div className="setting-row" key={label}>
              <label>{label}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" min={min} max={999999} value={value} onChange={(e) => setter(Number((e.target as HTMLInputElement).value))} />
                <span className="unit">ms</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-muted mt-2" style={{ color: "#f59e0b" }}>
          ⚠ Lower values increase the risk of being rate-limited or banned.
        </div>
      </div>

      {/* Whitelist */}
      <div className="settings-section">
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <div className="settings-title">★ Whitelist ({whitelist.length} users)</div>
        </div>

        {msg && (
          <div style={{
            padding: "6px 10px", borderRadius: 6, marginBottom: 10, fontSize: 12,
            background: msg.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: msg.type === "success" ? "#22c55e" : "#ef4444"
          }}>{msg.text}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => exportWhitelist(whitelist)} disabled={whitelist.length === 0}>Export</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>Import</button>
            <button className="btn btn-secondary" style={{ flex: 1, color: "#ef4444" }} onClick={() => { clearWhitelist(); onWhitelistUpdate([]); showMsg("Cleared", "success"); }} disabled={whitelist.length === 0}>Clear</button>
          </div>

          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#a1a1aa" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="radio" name="importMode" checked={importMode === "merge"} onChange={() => setImportMode("merge")} style={{ accentColor: "#6366f1" }} /> Merge
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="radio" name="importMode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} style={{ accentColor: "#6366f1" }} /> Replace
            </label>
          </div>

          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) importWhitelist(file,
                (imported) => {
                  const result = importMode === "merge" ? mergeWhitelists(whitelist, imported) : imported;
                  saveWhitelist(result); onWhitelistUpdate(result);
                  showMsg(`${importMode === "merge" ? "Merged" : "Replaced"} ${imported.length} users`, "success");
                },
                (err) => showMsg(err, "error")
              );
            }} />
        </div>
        <div className="text-muted mt-2">Whitelisted accounts are excluded from unfollow suggestions. Stored locally.</div>
      </div>
    </div>
  );
};
