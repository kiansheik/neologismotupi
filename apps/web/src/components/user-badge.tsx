import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { resolveUserBadge } from "@/lib/user-badges";

interface Props {
  displayName: string | null | undefined;
}

export function UserBadge({ displayName }: Props) {
  const { t } = useI18n();
  const badge = resolveUserBadge(displayName);

  if (badge === "creator") {
    return <Badge tone="approved">{t("badge.creator")}</Badge>;
  }

  return <Badge tone="neutral">{t("badge.community")}</Badge>;
}
