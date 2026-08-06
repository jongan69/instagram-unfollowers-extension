import React, { useEffect, useState, useCallback, useRef } from "react";
import { render } from "react-dom";
import "../styles/main.scss";
import type { AppStorageState } from "../messages";
import { STORAGE_KEY } from "../messages";
import type { Timings } from "../model/timings";
import type { UserNode } from "../model/user";
import { DEFAULT_TIME_BETWEEN_SEARCH_CYCLES, DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES, DEFAULT_TIME_BETWEEN_UNFOLLOWS, DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS } from "../constants/constants";
import { loadTimings, saveTimings, saveWhitelist } from "../utils/storage";
import { ScanView } from "../components/ScanView";
import { ResultsView } from "../components/ResultsView";
import { SettingsView } from "../components/SettingsView";
import { Toast } from "../components/Toast";

type Tab = "scan" | "results" | "settings";

const DEFAULT_STATE: AppStorageState = {
  status: "idle", percentage: 0, results: [], selectedIds: [],
  unfollowLog: [], filter: { showNonFollowers: true, showFollowers: false,
  showVerified: true, showPrivate: true, showWithOutProfilePicture: true },
  currentTab: "non_whitelisted", searchTerm: "", page: 1,
};

const DEFAULT_TIMINGS: Timings = {
  timeBetweenSearchCycles: DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
  timeToWaitAfterFiveSearchCycles: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
  timeBetweenUnfollows: DEFAULT_TIME_BETWEEN_UNFOLLOWS,
  timeToWaitAfterFiveUnfollows: DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
};

async function sendToContent(msg: { type: string; userIds?: string[] }) {
  const tabs = await chrome.tabs.query({ url: "*://www.instagram.com/*" });
  if (tabs.length === 0) throw new Error("Open Instagram and try again.");

  // Prefer the active tab, fall back to the first Instagram tab
  const activeTab = tabs.find((t) => t.active) ?? tabs[0];
  const tabId = activeTab.id!;

  try {
    // First attempt — content script should already be injected
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // If the content script isn't loaded, inject it programmatically
    if (message.includes("receiving end does not exist") || message.includes("Could not establish connection")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
          world: "ISOLATED",
        });
        // Wait for the content script to initialize its message listener
        // The init() function retries every 50ms, so 300ms is plenty
        await new Promise((r) => setTimeout(r, 300));
        // Retry after injection
        return await chrome.tabs.sendMessage(tabId, msg);
      } catch (injectErr) {
        throw new Error(
          "Could not connect to Instagram. Please refresh the Instagram page and try again."
        );
      }
    }

    throw err;
  }
}

function App() {
  const [state, setState] = useState<AppStorageState>(DEFAULT_STATE);
  const [timings, setTimings] = useState<Timings>(DEFAULT_TIMINGS);
  const [timingsLoaded, setTimingsLoaded] = useState(false);
  const [scanningPaused, setScanningPaused] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; text: string }>({ show: false, text: "" });
  const [activeTab, setActiveTab] = useState<Tab>("scan");
  const stateRef = useRef(state);

  // Load persisted state and timings on mount
  useEffect(() => {
    // Load timings from chrome.storage
    loadTimings().then((t) => {
      if (t) setTimings(t);
      setTimingsLoaded(true);
    });

    // Load scan state
    chrome.storage.local.get(STORAGE_KEY).then((stored) => {
      if (stored[STORAGE_KEY]) {
        const ss = stored[STORAGE_KEY] as AppStorageState;
        setState((prev) => ({ ...prev, status: ss.status, percentage: ss.percentage, results: ss.results, unfollowLog: ss.unfollowLog }));
        if (ss.status === "scanning" || ss.status === "scanning_done" || ss.status === "paused") setActiveTab("scan");
        if (ss.status === "unfollowing" || ss.status === "done") setActiveTab("results");
      }
    });
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEY]?.newValue) {
        const incoming = changes[STORAGE_KEY].newValue as AppStorageState;
        setState((prev) => ({ ...prev, status: incoming.status, percentage: incoming.percentage, results: incoming.results, unfollowLog: incoming.unfollowLog }));
        if (incoming.status === "scanning_done") setActiveTab("results");
        if (incoming.status === "done") setActiveTab("scan");
      }
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (timingsLoaded) saveTimings(timings);
  }, [timings, timingsLoaded]);
  useEffect(() => { stateRef.current = state; }, [state]);

  const updateState = useCallback((p: Partial<AppStorageState>) => setState((prev) => ({ ...prev, ...p })), []);

  const onScan = async () => {
    try {
      setState((prev) => ({ ...prev, selectedIds: [], page: 1, status: "scanning" as const }));
      setActiveTab("scan");
      await sendToContent({ type: "START_SCAN" });
    } catch (err) { setToast({ show: true, text: err instanceof Error ? err.message : String(err) }); }
  };

  const onPauseToggle = async () => {
    const np = !scanningPaused; setScanningPaused(np);
    try { await sendToContent({ type: np ? "PAUSE_SCAN" : "RESUME_SCAN" }); }
    catch { setToast({ show: true, text: "Failed to toggle pause" }); }
  };

  const onUnfollow = async (userIds: string[]) => {
    try { await sendToContent({ type: "START_UNFOLLOW", userIds }); }
    catch (err) { setToast({ show: true, text: err instanceof Error ? err.message : String(err) }); }
  };

  const onReset = () => {
    if (state.status === "scanning" || state.status === "unfollowing") {
      if (!confirm("Active process running. Stop?")) return;
      sendToContent({ type: "STOP_UNFOLLOW" }).catch(() => {});
    }
    setState({ ...DEFAULT_STATE }); setScanningPaused(false); setActiveTab("scan");
  };

  const onWhitelistUpdate = useCallback((users: readonly UserNode[]) => { saveWhitelist(users); }, []);

  const isScanning = state.status === "scanning" || state.status === "paused";
  const hasResults = state.status === "scanning_done" || (state.status === "scanning" && state.results.length > 0);
  const isUnfollowing = state.status === "unfollowing";
  const isDone = state.status === "done";

  return (
    <div id="app-root" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <span>Unfollowers</span>
          </div>
        </div>
        <div className="header-actions">
          {(isScanning || isUnfollowing) && (
            <button className="btn btn-ghost" onClick={onReset} style={{ fontSize: 11 }}>Stop</button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab ${activeTab === "scan" ? "active" : ""}`} onClick={() => setActiveTab("scan")}>Scan</button>
        <button className={`tab ${activeTab === "results" ? "active" : ""}`} onClick={() => setActiveTab("results")} disabled={!hasResults && !isUnfollowing && !isDone}>Results</button>
        <button className={`tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>Settings</button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === "scan" && (
          <ScanView state={state} onScan={onScan} onPauseToggle={onPauseToggle} scanningPaused={scanningPaused} hasResults={!!hasResults} onViewResults={() => setActiveTab("results")} />
        )}
        {activeTab === "results" && (
          hasResults || isUnfollowing || isDone ? (
            <ResultsView state={state} updateState={updateState} onUnfollow={onUnfollow} isUnfollowing={isUnfollowing} isDone={isDone} />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No results yet</div>
              <div className="empty-desc">Run a scan first to see who doesn't follow you back.</div>
              <button className="btn btn-primary" onClick={() => { setActiveTab("scan"); onScan(); }}>Start Scan</button>
            </div>
          )
        )}
        {activeTab === "settings" && (
          <SettingsView timings={timings} setTimings={setTimings} onWhitelistUpdate={onWhitelistUpdate} />
        )}
      </div>

      {toast.show && <Toast show={toast.show} message={toast.text} onClose={() => setToast({ show: false, text: "" })} />}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
