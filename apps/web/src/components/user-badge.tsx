import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { resolveUserBadges, type UserBadgeKind } from "@/lib/user-badges";

interface Props {
  displayName: string | null | undefined;
  badges?: string[] | null;
}

export function UserBadge({ displayName, badges }: Props) {
  const { t } = useI18n();
  const resolved = useMemo(() => resolveUserBadges(displayName, badges), [displayName, badges]);
  const [activeBadge, setActiveBadge] = useState<UserBadgeKind | null>(null);

  const labelForBadge = (badge: UserBadgeKind): string => {
    if (badge === "founder") {
      return t("badge.founder");
    }
    if (badge === "top_contributor") {
      return t("badge.topContributor");
    }
    return t("badge.karmaLeader");
  };

  const emojiForBadge = (badge: UserBadgeKind): string => {
    if (badge === "founder") {
      return "🛠️";
    }
    if (badge === "top_contributor") {
      return "💪";
    }
    return "💎";
  };

  if (resolved.length === 0) {
    return null;
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1 align-middle">
      {resolved.map((badge) => {
        const label = labelForBadge(badge);
        return (
          <button
            key={badge}
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none hover:bg-slate-100"
            title={label}
            aria-label={label}
            onClick={(event) => {
              event.preventDefault();
              setActiveBadge((current) => (current === badge ? null : badge));
            }}
          >
            <span aria-hidden>{emojiForBadge(badge)}</span>
          </button>
        );
      })}
      {activeBadge ? (
        <Badge tone="neutral">
          {labelForBadge(activeBadge)}
        </Badge>
      ) : null}
    </span>
  );
}
