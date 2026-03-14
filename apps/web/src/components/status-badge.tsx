import type { EntryStatus, ExampleStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { statusToKey } from "@/i18n/formatters";
import { useI18n } from "@/i18n";

interface Props {
  status: EntryStatus | ExampleStatus;
  showPending?: boolean;
}

export function StatusBadge({ status, showPending = false }: Props) {
  const { t } = useI18n();
  const label = t(statusToKey(status));

  if (status === "approved") {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white"
        title={t("status.approvedTooltip")}
        aria-label={t("status.approvedTooltip")}
      >
        ✓
      </span>
    );
  }
  if (status === "pending") {
    if (!showPending) {
      return null;
    }
    return <Badge tone="pending">{label}</Badge>;
  }
  if (status === "disputed") {
    return <Badge tone="disputed">{label}</Badge>;
  }
  if (status === "hidden" || status === "rejected" || status === "archived") {
    return <Badge tone="danger">{label}</Badge>;
  }
  return <Badge>{label}</Badge>;
}
