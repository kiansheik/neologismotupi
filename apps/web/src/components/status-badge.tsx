import type { EntryStatus, ExampleStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  status: EntryStatus | ExampleStatus;
}

export function StatusBadge({ status }: Props) {
  if (status === "approved") {
    return <Badge tone="approved">approved</Badge>;
  }
  if (status === "pending") {
    return <Badge tone="pending">pending</Badge>;
  }
  if (status === "disputed") {
    return <Badge tone="disputed">disputed</Badge>;
  }
  if (status === "hidden" || status === "rejected" || status === "archived") {
    return <Badge tone="danger">{status}</Badge>;
  }
  return <Badge>{status}</Badge>;
}
