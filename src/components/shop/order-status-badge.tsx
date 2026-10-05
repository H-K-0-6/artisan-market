import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "success" | "indigo" | "danger" | "secondary" }> = {
  PENDING: { label: "Awaiting payment", variant: "indigo" },
  PAID: { label: "Paid", variant: "success" },
  SHIPPED: { label: "Shipped", variant: "success" },
  DELIVERED: { label: "Delivered", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
  EXPIRED: { label: "Expired", variant: "secondary" },
  REFUNDED: { label: "Refunded", variant: "danger" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
