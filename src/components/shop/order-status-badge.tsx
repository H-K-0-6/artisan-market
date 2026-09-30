import { Badge } from "@/components/ui/badge";

const LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const variant =
    status === "PAID" || status === "SHIPPED" || status === "DELIVERED"
      ? "default"
      : status === "PENDING"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{LABEL[status] ?? status}</Badge>;
}
