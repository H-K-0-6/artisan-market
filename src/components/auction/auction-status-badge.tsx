import { Badge } from "@/components/ui/badge";

type Variant = "live" | "success" | "warning" | "danger" | "indigo" | "secondary";

const MAP: Record<string, { label: string; variant: Variant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "indigo" },
  LIVE: { label: "Live", variant: "live" },
  ENDED: { label: "Sold, awaiting payment", variant: "warning" },
  PAID: { label: "Sold and paid", variant: "success" },
  UNSOLD: { label: "Unsold", variant: "secondary" },
  CANCELLED: { label: "Withdrawn", variant: "danger" },
};

export function AuctionStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
