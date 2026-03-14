export type UserBadgeKind = "creator" | "community";

const CREATOR_HANDLE = "kiansheik3128";

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveUserBadge(displayName: string | null | undefined): UserBadgeKind {
  if (normalizeHandle(displayName) === CREATOR_HANDLE) {
    return "creator";
  }
  return "community";
}
