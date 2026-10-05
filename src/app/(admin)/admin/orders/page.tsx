import { requireRolePage } from "@/lib/rbac";
import { listOrders, ORDER_SORTS } from "@/server/queries/admin";
import { first, parseTableState, pickEnum, toView, type SearchParams } from "@/lib/table-params";
import { OrdersTable } from "@/components/admin/tables/orders-table";

export const metadata = { title: "Orders · Admin" };

const STATUSES = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRolePage("admin");
  const sp = await searchParams;
  const state = parseTableState(sp, { sortable: ORDER_SORTS, defaultSort: "createdAt" });
  const result = await listOrders({
    ...state,
    status: pickEnum(sp, "status", STATUSES),
    source: pickEnum(sp, "source", ["CART", "AUCTION"] as const),
    q: first(sp, "q"),
  });

  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl">Orders</h1>
      <OrdersTable rows={result.rows} view={toView(result, state, sp)} />
    </div>
  );
}
