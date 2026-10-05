import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { getMyOrder } from "@/server/queries/orders";
import { OrderSummary } from "@/components/shop/order-summary";
import { RefreshWhilePending } from "@/components/shop/refresh-while-pending";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Thank you" };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRolePage();
  const { order: orderParam } = await searchParams;
  const orderId = Array.isArray(orderParam) ? orderParam[0] : orderParam;
  if (!orderId) notFound();
  const order = await getMyOrder(session.user.id, orderId);
  if (!order) notFound();

  const pending = order.status === "PENDING";
  const confirmed = order.status === "PAID" || order.status === "SHIPPED" || order.status === "DELIVERED";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-2">
        <h1 className="display text-4xl">
          {pending ? "Confirming your payment…" : confirmed ? "Thank you for your order!" : "Order update"}
        </h1>
        <p className="text-muted-foreground">
          {pending
            ? "We're waiting for Stripe to confirm your payment. This usually takes a few seconds, and this page updates on its own. You can also check your orders later."
            : confirmed
              ? "Your payment is confirmed. The makers have been notified, and we'll let you know when your order ships."
              : "This order is no longer active."}
        </p>
      </div>
      {pending && <RefreshWhilePending />}
      <OrderSummary order={order} />
      <div className="flex gap-2">
        <Link href={`/account/orders/${order.id}`} className={buttonVariants({ variant: "outline" })}>
          View order
        </Link>
        <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
