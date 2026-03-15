export type UserBadgeKind = "founder" | "top_contributor" | "karma_leader";
export type UserBadgeLabelKey = "badge.founder" | "badge.topContributor" | "badge.karmaLeader";

const FOUNDER_HANDLE = "kiansheik3128";
const ORDERED_BADGES: UserBadgeKind[] = ["founder", "top_contributor", "karma_leader"];

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isSupportedBadge(value: string): value is UserBadgeKind {
  return value === "founder" || value === "top_contributor" || value === "karma_leader";
}

export function badgeLabelKey(badge: UserBadgeKind): UserBadgeLabelKey {
  if (badge === "founder") {
    return "badge.founder";
  }
  if (badge === "top_contributor") {
    return "badge.topContributor";
  }
  return "badge.karmaLeader";
}

export function badgeEmoji(badge: UserBadgeKind): string {
  if (badge === "founder") {
    return "🛠️";
  }
  if (badge === "top_contributor") {
    return "💪";
  }
  return "💎";
}

export function resolveUserBadges(
  displayName: string | null | undefined,
  apiBadges?: string[] | null,
): UserBadgeKind[] {
  if (apiBadges?.length) {
    const unique = new Set<UserBadgeKind>();
    for (const badge of apiBadges) {
      if (isSupportedBadge(badge)) {
        unique.add(badge);
      }
    }
    if (unique.size > 0) {
      return ORDERED_BADGES.filter((badge) => unique.has(badge));
    }
  }

  if (normalizeHandle(displayName) === FOUNDER_HANDLE) {
    return ["founder"];
  }
  return [];
}
