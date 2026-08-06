import type { UserNode } from "../model/user";
import type { Timings } from "../model/timings";
import {
  WHITELISTED_RESULTS_STORAGE_KEY,
  TIMINGS_STORAGE_KEY,
} from "../constants/constants";

// ── Whitelist ──────────────────────────────────────────────────────────────

export function loadWhitelist(): UserNode[] {
  const raw = localStorage.getItem(WHITELISTED_RESULTS_STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as UserNode[]);
}

export function saveWhitelist(users: readonly UserNode[]): void {
  localStorage.setItem(
    WHITELISTED_RESULTS_STORAGE_KEY,
    JSON.stringify(users)
  );
}

export function exportWhitelist(users: readonly UserNode[]): void {
  if (users.length === 0) {
    alert("No users in whitelist to export");
    return;
  }
  const blob = new Blob([JSON.stringify(users, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instagram-whitelist-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importWhitelist(
  file: File,
  onSuccess: (users: UserNode[]) => void,
  onError: (message: string) => void
): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const imported = JSON.parse(content) as UserNode[];
      if (!Array.isArray(imported)) {
        onError("Invalid format: expected an array of users");
        return;
      }
      const valid = imported.every(
        (u) =>
          u.id &&
          u.username &&
          typeof u.id === "string" &&
          typeof u.username === "string"
      );
      if (!valid) {
        onError("Users missing required fields (id, username)");
        return;
      }
      onSuccess(imported);
    } catch (err) {
      onError(
        `Failed to parse JSON: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };
  reader.onerror = () => onError("Failed to read file");
  reader.readAsText(file);
}

export function clearWhitelist(): void {
  if (
    !confirm(
      "Are you sure you want to clear the entire whitelist? This action cannot be undone."
    )
  ) {
    return;
  }
  localStorage.removeItem(WHITELISTED_RESULTS_STORAGE_KEY);
}

export function mergeWhitelists(
  existing: readonly UserNode[],
  imported: readonly UserNode[]
): UserNode[] {
  const existingIds = new Set(existing.map((u) => u.id));
  const unique = imported.filter((u) => !existingIds.has(u.id));
  return [...existing, ...unique];
}

// ── Timings ───────────────────────────────────────────────────────────────

const isTimings = (value: unknown): value is Timings => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  return Object.values(value).every((t) => typeof t === "number");
};

export function loadTimings(): Timings | null {
  const raw = localStorage.getItem(TIMINGS_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isTimings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTimings(timings: Timings): void {
  localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(timings));
}
