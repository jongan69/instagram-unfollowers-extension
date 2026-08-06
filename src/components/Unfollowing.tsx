import React from "react";
import type { AppStorageState } from "../messages";
import { getUnfollowLogForDisplay } from "../utils/utils";

interface UnfollowingProps {
  state: AppStorageState;
  updateState: (patch: Partial<AppStorageState>) => void;
}

export const Unfollowing = ({ state, updateState }: UnfollowingProps) => {
  const displayed = getUnfollowLogForDisplay(
    state.unfollowLog,
    state.searchTerm,
    {
      showSucceeded: true,
      showFailed: true,
    }
  );

  return (
    <section className="workspace-layout">
      <aside className="app-sidebar">
        <div className="panel-heading">
          <span>Unfollow Queue</span>
          <strong>{state.percentage}%</strong>
        </div>
        <menu className="flex column grow m-clear p-clear">
          <p style={{ color: "var(--muted)", fontSize: "0.76rem", fontWeight: 900, textTransform: "uppercase" }}>
            Filter
          </p>
        </menu>
      </aside>
      <article className="unfollow-log-container">
        {state.status === "done" && (
          <>
            <hr />
            <div className="fs-large p-medium clr-green">All DONE!</div>
            <hr />
          </>
        )}
        {displayed.map((entry, index) =>
          entry.unfollowedSuccessfully ? (
            <div className="p-medium" key={entry.user.id}>
              Unfollowed
              <a
                className="clr-inherit"
                target="_blank"
                href={`https://www.instagram.com/${entry.user.username}`}
                rel="noreferrer"
              >
                &nbsp;{entry.user.username}
              </a>
              <span className="clr-cyan">
                &nbsp; [{index + 1}/{state.selectedIds.length}]
              </span>
            </div>
          ) : (
            <div className="p-medium clr-red" key={entry.user.id}>
              Failed to unfollow {entry.user.username} [{index + 1}/{state.selectedIds.length}]
            </div>
          )
        )}
      </article>
    </section>
  );
};
