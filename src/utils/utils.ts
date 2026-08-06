import type { UserNode } from "../model/user";
import type { UnfollowLogEntry } from "../model/unfollow-log-entry";
import type { ScanningTab } from "../model/scanning-tab";
import type { ScanningFilter } from "../model/scanning-filter";
import type { UnfollowFilter } from "../model/unfollow-filter";
import { UNFOLLOWERS_PER_PAGE } from "../constants/constants";
import { WITHOUT_PROFILE_PICTURE_URL_IDS } from "../constants/constants";

// ── Clipboard ──────────────────────────────────────────────────────────────

export async function copyListToClipboard(
  nonFollowersList: readonly UserNode[]
): Promise<void> {
  const sorted = [...nonFollowersList].sort((a, b) =>
    a.username > b.username ? 1 : -1
  );
  const output = sorted.map((u) => u.username).join("\n");
  await navigator.clipboard.writeText(output);
}

// ── Export ─────────────────────────────────────────────────────────────────

export function exportToJSON(users: readonly UserNode[]): void {
  const blob = new Blob([JSON.stringify(users, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "instagram_unfollowers.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCSV(users: readonly UserNode[]): void {
  const headers = [
    "id",
    "username",
    "full_name",
    "is_verified",
    "is_private",
    "profile_pic_url",
  ];
  const rows = users.map((u) => [
    u.id,
    u.username,
    `"${u.full_name.replace(/"/g, '""')}"`,
    u.is_verified,
    u.is_private,
    u.profile_pic_url,
  ]);
  const csv =
    "data:text/csv;charset=utf-8," +
    headers.join(",") +
    "\n" +
    rows.map((e) => e.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = "instagram_unfollowers.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Pagination ─────────────────────────────────────────────────────────────

export function getMaxPage(nonFollowersList: readonly UserNode[]): number {
  return Math.max(1, Math.ceil(nonFollowersList.length / UNFOLLOWERS_PER_PAGE));
}

export function getCurrentPageUnfollowers(
  nonFollowersList: readonly UserNode[],
  currentPage: number
): UserNode[] {
  const sorted = [...nonFollowersList].sort((a, b) =>
    a.username > b.username ? 1 : -1
  );
  return sorted.slice(
    UNFOLLOWERS_PER_PAGE * (currentPage - 1),
    UNFOLLOWERS_PER_PAGE * currentPage
  );
}

// ── Profile picture detection ─────────────────────────────────────────────

export function isWithoutProfilePicture(user: UserNode): boolean {
  return WITHOUT_PROFILE_PICTURE_URL_IDS.some((id) =>
    user.profile_pic_url.includes(id)
  );
}

// ── Filtering & display ───────────────────────────────────────────────────

export function getUsersForDisplay(
  results: readonly UserNode[],
  whitelistedResults: readonly UserNode[],
  currentTab: ScanningTab,
  searchTerm: string,
  filter: ScanningFilter
): UserNode[] {
  const whitelistedIds = new Set(whitelistedResults.map((u) => u.id));
  const term = searchTerm.toLowerCase();

  return results.filter((r) => {
    // Tab filter
    if (currentTab === "non_whitelisted" && whitelistedIds.has(r.id))
      return false;
    if (currentTab === "whitelisted" && !whitelistedIds.has(r.id)) return false;

    // Attribute filters
    if (!filter.showPrivate && r.is_private) return false;
    if (!filter.showVerified && r.is_verified) return false;
    if (!filter.showFollowers && r.follows_viewer) return false;
    if (!filter.showNonFollowers && !r.follows_viewer) return false;
    if (!filter.showWithOutProfilePicture && isWithoutProfilePicture(r))
      return false;

    // Search
    if (
      term &&
      !r.username.toLowerCase().includes(term) &&
      !r.full_name.toLowerCase().includes(term)
    )
      return false;

    return true;
  });
}

export function getUnfollowLogForDisplay(
  log: readonly UnfollowLogEntry[],
  searchTerm: string,
  filter: UnfollowFilter
): UnfollowLogEntry[] {
  const term = searchTerm.toLowerCase();
  return log.filter((entry) => {
    if (!filter.showSucceeded && entry.unfollowedSuccessfully) return false;
    if (!filter.showFailed && !entry.unfollowedSuccessfully) return false;
    if (
      term &&
      !entry.user.username.toLowerCase().includes(term)
    )
      return false;
    return true;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function assertUnreachable(_value: never): never {
  throw new Error("Statement should be unreachable");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) return null;
  return parts.pop()!.split(";").shift()!;
}

export function urlGenerator(
  cookieReader: (name: string) => string | null,
  nextCode?: string
): string {
  const dsUserId = cookieReader("ds_user_id");
  const base =
    "https://www.instagram.com/graphql/query/?query_hash=3dec7e2c57367ef3da3d987d89f9dbc8";
  if (!nextCode) {
    return `${base}&variables={"id":"${dsUserId}","include_reel":"true","fetch_mutual":"false","first":"24"}`;
  }
  return `${base}&variables={"id":"${dsUserId}","include_reel":"true","fetch_mutual":"false","first":"24","after":"${nextCode}"}`;
}

export function unfollowUserUrlGenerator(idToUnfollow: string): string {
  return `https://www.instagram.com/web/friendships/${idToUnfollow}/unfollow/`;
}
