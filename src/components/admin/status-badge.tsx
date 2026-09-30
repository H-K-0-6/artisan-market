import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "destructive" | "outline";

const VARIANTS: Record<string, Variant> = {
  // products
  ACTIVE: "default",
  DRAFT: "secondary",
  HIDDEN: "destructive",
  ARCHIVED: "outline",
  // auctions
  SCHEDULED: "secondary",
  LIVE: "default",
  ENDED: "outline",
  UNSOLD: "outline",
  CANCELLED: "destructive",
  // orders (PAID shared with auctions)
  PENDING: "secondary",
  PAID: "default",
  SHIPPED: "default",
  DELIVERED: "outline",
  EXPIRED: "outline",
  REFUNDED: "destructive",
};

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Status is always text + color, never color alone. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? "secondary"}>{titleCase(status)}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === "admin" ? "default" : role === "artisan" ? "secondary" : "outline"}>{role}</Badge>;
}
