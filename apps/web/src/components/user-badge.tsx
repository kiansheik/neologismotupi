import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { resolveUserBadges } from "@/lib/user-badges";

interface Props {
  displayName: string | null | undefined;
  badges?: string[] | null;
}

export function UserBadge({ displayName, badges }: Props) {
  const { t } = useI18n();
  const resolved = resolveUserBadges(displayName, badges);

  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {resolved.map((badge) => {
        if (badge === "founder") {
          return (
            <Badge key={badge} tone="approved">
              {t("badge.founder")}
            </Badge>
          );
        }
        if (badge === "top_contributor") {
          return (
            <Badge key={badge} tone="pending">
              {t("badge.topContributor")}
            </Badge>
          );
        }
        if (badge === "karma_leader") {
          return (
            <Badge key={badge} tone="disputed">
              {t("badge.karmaLeader")}
            </Badge>
          );
        }
        return (
          <Badge key={badge} tone="neutral">
            {t("badge.community")}
          </Badge>
        );
      })}
    </span>
  );
}
