import React, { useEffect, useState } from "react";
import type { AppStorageState } from "../messages";
import { loadWhitelist } from "../utils/storage";

interface Props {
  state: AppStorageState;
  onScan: () => void;
  onPauseToggle: () => void;
  scanningPaused: boolean;
  hasResults: boolean;
  onViewResults: () => void;
}

export const ScanView = ({ state, onScan, onPauseToggle, scanningPaused, hasResults, onViewResults }: Props) => {
  const [whitelistCount, setWhitelistCount] = useState(0);
  const nonFollowers = state.results.filter((u) => !u.follows_viewer).length;
  const isIdle = state.status === "idle";
  const isScanning = state.status === "scanning" || state.status === "paused";
  const isDone = state.status === "scanning_done";

  useEffect(() => {
    loadWhitelist().then((w) => setWhitelistCount(w.length));
  }, [state.results.length]); // Refresh whitelist count when results change

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {isIdle && (
        <div className="scan-hero">
          <div className="scan-icon">🔍</div>
          <h2>Find non-followers</h2>
          <p>Scans your following list via Instagram&rsquo;s API to identify who doesn&rsquo;t follow you back. All data stays in your browser.</p>
          <button className="btn btn-primary btn-lg" onClick={onScan}>Start Scan</button>
          <div className="scan-stats">
            <div><div className="num" style={{ color: "#a1a1aa" }}>—</div><div className="lbl">Following</div></div>
            <div><div className="num" style={{ color: "#ef4444" }}>—</div><div className="lbl">Non-Followers</div></div>
            <div><div className="num" style={{ color: "#f59e0b" }}>—</div><div className="lbl">Whitelisted</div></div>
          </div>
        </div>
      )}

      {(isScanning || isDone) && (
        <>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-label">Following</div><div className="stat-value">{state.results.length}</div></div>
            <div className="stat-card danger"><div className="stat-label">Non-Followers</div><div className="stat-value">{nonFollowers}</div></div>
            <div className="stat-card accent"><div className="stat-label">Whitelisted</div><div className="stat-value">{whitelistCount}</div></div>
          </div>

          <div>
            <div className="progress-wrap">
              <div className="progress-fill" style={{ width: `${state.percentage}%` }} />
            </div>
            <div className="progress-label">
              <span>{isScanning ? (scanningPaused ? "Paused" : "Scanning…") : "Done"}</span>
              <span className="pct">{state.percentage}%</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {isScanning && (
              <button className="btn btn-secondary" onClick={onPauseToggle}>
                {scanningPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
            {isDone && (
              <button className="btn btn-primary" onClick={onViewResults}>
                View Results →
              </button>
            )}
            <button className="btn btn-ghost" onClick={onScan} disabled={isScanning}>
              ↻ Rescan
            </button>
          </div>
        </>
      )}
    </div>
  );
};
