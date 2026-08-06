import React, { useState, useRef } from "react";
import type { UserNode } from "../model/user";
import {
  exportWhitelist,
  importWhitelist,
  clearWhitelist,
  mergeWhitelists,
  saveWhitelist,
} from "../utils/storage";

interface WhitelistManagerProps {
  whitelistedUsers: readonly UserNode[];
  onWhitelistUpdate: (users: readonly UserNode[]) => void;
}

export const WhitelistManager = ({
  whitelistedUsers,
  onWhitelistUpdate,
}: WhitelistManagerProps) => {
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleImport = (file: File) => {
    importWhitelist(
      file,
      (imported) => {
        const result =
          importMode === "merge"
            ? mergeWhitelists(whitelistedUsers, imported)
            : imported;
        saveWhitelist(result);
        onWhitelistUpdate(result);
        showMessage(
          `Successfully ${importMode === "merge" ? "merged" : "replaced"} whitelist with ${imported.length} users`,
          "success"
        );
      },
      (error) => showMessage(error, "error")
    );
  };

  return (
    <div className="whitelist-manager">
      <div className="whitelist-header">
        <h4>Whitelist Management</h4>
        <span className="whitelist-count">{whitelistedUsers.length} users</span>
      </div>

      {message && (
        <div className={`whitelist-message ${message.type}`}>{message.text}</div>
      )}

      <div className="whitelist-actions">
        <button
          className="btn btn-export"
          onClick={() => exportWhitelist(whitelistedUsers)}
          disabled={whitelistedUsers.length === 0}
        >
          Export Whitelist
        </button>

        <div className="import-section">
          <div className="import-mode">
            <label>
              <input
                type="radio"
                name="importMode"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
              />
              Merge with existing
            </label>
            <label>
              <input
                type="radio"
                name="importMode"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
              />
              Replace existing
            </label>
          </div>
          <button className="btn btn-import" onClick={() => fileInputRef.current?.click()}>
            Import Whitelist
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleImport(file);
            }}
          />
        </div>

        <button
          className="btn btn-clear"
          onClick={() => {
            clearWhitelist();
            onWhitelistUpdate([]);
            showMessage("Whitelist cleared successfully", "success");
          }}
          disabled={whitelistedUsers.length === 0}
        >
          Clear Whitelist
        </button>
      </div>

      <div className="whitelist-info">
        <p className="info-text">
          <strong>Whitelist</strong> — these accounts will be excluded from
          unfollow suggestions. Export to back up, import to restore or transfer
          from another device.
        </p>
      </div>
    </div>
  );
};
