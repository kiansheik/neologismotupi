import type { EntryStatus, ExampleStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { statusToKey } from "@/i18n/formatters";
import { useI18n } from "@/i18n";

interface Props {
  status: EntryStatus | ExampleStatus;
}

export function StatusBadge({ status }: Props) {
  const { t } = useI18n();
  const label = t(statusToKey(status));

  if (status === "approved") {
    return <Badge tone="approved">{label}</Badge>;
  }
  if (status === "pending") {
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
