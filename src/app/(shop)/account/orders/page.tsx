import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { listMyOrders } from "@/server/queries/orders";
import { OrderStatusBadge } from "@/components/shop/order-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "My orders" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function MyOrdersPage() {
  const session = await requireRolePage();
  const orders = await listMyOrders(session.user.id);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">My orders</h1>
      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          No orders yet.{" "}
          <Link href="/products" className="underline">
            Browse the shop
          </Link>
          .
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <Link href={`/account/orders/${o.id}`} className="hover:underline">
                    #{o.id.slice(-8).toUpperCase()}
                  </Link>
                </TableCell>
                <TableCell>{dateFmt.format(o.createdAt)}</TableCell>
                <TableCell className="max-w-64 truncate">
                  {o.items.map((i) => (i.qty > 1 ? `${i.titleSnapshot} ×${i.qty}` : i.titleSnapshot)).join(", ")}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(o.totalCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
