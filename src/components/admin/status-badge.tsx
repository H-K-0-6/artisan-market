import { Badge } from "@/components/ui/badge";

type Variant = "live" | "success" | "warning" | "danger" | "indigo" | "secondary";

// Dye semantics: saffron = live, weld = done well, madder = needs attention,
// indigo = waiting on someone, plain = inactive.
const VARIANTS: Record<string, Variant> = {
  // products
  ACTIVE: "success",
  DRAFT: "secondary",
  HIDDEN: "danger",
  ARCHIVED: "secondary",
  // auctions
  SCHEDULED: "indigo",
  LIVE: "live",
  ENDED: "warning",
  UNSOLD: "secondary",
  CANCELLED: "danger",
  // orders (PAID shared with auctions)
  PENDING: "indigo",
  PAID: "success",
  SHIPPED: "success",
  DELIVERED: "success",
  EXPIRED: "secondary",
  REFUNDED: "danger",
};

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Status is always text + colour, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? "secondary"}>{titleCase(status)}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === "admin" ? "indigo" : role === "artisan" ? "warning" : "secondary"}>{titleCase(role)}</Badge>;
}
