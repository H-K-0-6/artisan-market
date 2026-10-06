import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { getMyOrder } from "@/server/queries/orders";
import { OrderSummary } from "@/components/shop/order-summary";
import { PendingOrderActions } from "@/components/shop/pending-order-actions";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Order" };

export default async function MyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRolePage();
  const order = await getMyOrder(session.user.id, (await params).id);
  if (!order) notFound();

  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/account/orders" className="text-sm text-muted-foreground hover:underline">
        ← All orders
      </Link>
      <OrderSummary order={order} />
      {order.status === "PENDING" && order.source === "CART" && (
        <div className="grid gap-2 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            This order is waiting for payment. We hold your pieces for a short while; after that they go back on sale and return to your cart.
          </p>
          <PendingOrderActions orderId={order.id} />
        </div>
      )}
      {order.status === "PENDING" && order.source === "AUCTION" && (
        <div className="grid gap-2 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">You won this auction. Complete payment before the deadline.</p>
          <Link href={`/pay/${order.id}`} className={buttonVariants({ className: "w-fit" })}>
            Pay now
          </Link>
        </div>
      )}
    </div>
  );
}
