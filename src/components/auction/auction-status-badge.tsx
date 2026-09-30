import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  LIVE: { label: "Live", variant: "default" },
  ENDED: { label: "Sold, awaiting payment", variant: "outline" },
  PAID: { label: "Sold, paid", variant: "default" },
  UNSOLD: { label: "Unsold", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export function AuctionStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
