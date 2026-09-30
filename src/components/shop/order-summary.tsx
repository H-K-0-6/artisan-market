import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { formatAddress, type getMyOrder } from "@/server/queries/orders";
import { OrderStatusBadge } from "@/components/shop/order-status-badge";

type Order = NonNullable<Awaited<ReturnType<typeof getMyOrder>>>;

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function OrderSummary({ order }: { order: Order }) {
  const address = formatAddress(order.shippingAddress);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Order #{order.id.slice(-8).toUpperCase()}</h2>
        <OrderStatusBadge status={order.status} />
        {order.source === "AUCTION" && <span className="text-sm text-muted-foreground">Auction win</span>}
      </div>
      <div className="text-sm text-muted-foreground">
        Placed {dateFmt.format(order.createdAt)}
        {order.paidAt && <> · Paid {dateFmt.format(order.paidAt)}</>}
      </div>

      <ul className="divide-y rounded-lg border">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-4 p-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.product.images[0] && (
                <Image src={item.product.images[0].url} alt="" fill sizes="64px" className="object-cover" />
              )}
            </div>
            <div className="grid flex-1 gap-1 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <Link href={`/products/${item.product.slug}`} className="font-medium hover:underline">
                  {item.titleSnapshot}
                </Link>
                <span className="tabular-nums">{formatCents(item.unitPriceCents * item.qty)}</span>
              </div>
              <div className="text-muted-foreground">
                {item.qty} × {formatCents(item.unitPriceCents)} ·{" "}
                <Link href={`/shops/${item.artisan.slug}`} className="hover:underline">
                  {item.artisan.shopName}
                </Link>
              </div>
              {item.shippedAt ? (
                <div>
                  Shipped {dateFmt.format(item.shippedAt)}
                  {item.trackingNo && <> · Tracking {item.trackingNo}</>}
                </div>
              ) : (
                order.status === "PAID" && <div className="text-muted-foreground">Preparing to ship</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-1 text-sm">
          <div className="font-medium">Shipping to</div>
          {address.length ? (
            address.map((line) => <div key={line}>{line}</div>)
          ) : (
            <div className="text-muted-foreground">Provided at payment</div>
          )}
        </div>
        <div className="grid content-start gap-1 text-sm sm:justify-self-end">
          <div className="flex justify-between gap-8">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCents(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between gap-8 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCents(order.totalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
