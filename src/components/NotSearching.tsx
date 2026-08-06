import React from "react";
import { Logo } from "./icons/Icons";

interface NotSearchingProps {
  onScan: () => void;
}

export const NotSearching = ({ onScan }: NotSearchingProps) => (
  <section className="launch-screen">
    <div className="launch-copy">
      <span className="eyebrow">Instagram Tools</span>
      <h1>Find who doesn&rsquo;t follow you back</h1>
      <p>
        Scan your followers, identify non-reciprocal follows, whitelist the ones
        you want to keep, and unfollow the rest — all from a clean interface.
      </p>
      <div className="launch-actions">
        <button className="run-scan" onClick={onScan}>
          Start Scan
        </button>
        <span className="launch-note">Runs entirely in your browser</span>
      </div>
    </div>
    <div className="launch-panel" aria-hidden="true">
      <div className="scan-orbit">
        <span />
        <span />
        <span />
      </div>
      <div className="signal-card primary">
        <span>Following</span>
        <strong>—</strong>
      </div>
      <div className="signal-card">
        <span>Non-Followers</span>
        <strong>—</strong>
      </div>
      <div className="signal-card accent">
        <span>Whitelisted</span>
        <strong>—</strong>
      </div>
    </div>
  </section>
);
