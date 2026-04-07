import type { EntryStatus, ExampleStatus } from "@/lib/types";
import { useId } from "react";
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
  const tooltipId = useId();

  if (status === "approved") {
    const tooltip = t("status.approvedTooltip");
    return (
      <span className="group relative inline-flex">
        <span
          className="inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white outline-none"
          aria-label={tooltip}
          aria-describedby={tooltipId}
          tabIndex={0}
        >
          ✓
        </span>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-md bg-tooltip px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus-within:block"
        >
          {tooltip}
        </span>
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
