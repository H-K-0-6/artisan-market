import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { formatAddress, getMyOrder } from "@/server/queries/orders";
import type { ShippingAddress } from "@/server/services/payments";
import { CheckoutSteps } from "@/components/checkout/checkout-steps";
import type { AddressDefaults } from "@/components/checkout/address-form";

export const metadata = { title: "Pay" };

const isPast = (d: Date | null) => d != null && d.getTime() <= Date.now();

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const [{ orderId }, { payment }] = await Promise.all([params, searchParams]);
  const session = await requireRolePage();
  const order = await getMyOrder(session.user.id, orderId);
  if (!order) notFound();
  if (order.status === "PAID" || order.status === "SHIPPED" || order.status === "DELIVERED") redirect(`/checkout/success?order=${order.id}`);
  if (order.status !== "PENDING") redirect(`/account/orders/${order.id}`);
  const deadlinePassed = isPast(order.payDeadline);

  // Pre-fill the address from this order, or the buyer's most recent one.
  const saved = order.shippingAddress as ShippingAddress | null;
  const previous =
    saved ??
    ((
      await prisma.order.findFirst({
        where: { buyerId: session.user.id, shippingAddress: { not: Prisma.AnyNull }, id: { not: order.id } },
        orderBy: { createdAt: "desc" },
        select: { shippingAddress: true },
      })
    )?.shippingAddress as ShippingAddress | null);
  const fields = previous?.fields;
  const defaults: AddressDefaults = {
    name: previous?.name ?? session.user.name,
    phone: previous?.phone?.replace(/^\+973/, ""),
    building: fields?.building,
    flat: fields?.flat,
    road: fields?.road,
    block: fields?.block,
    area: fields?.area,
  };
  const total = formatCents(order.totalCents);

  return (
    <div className="grid gap-8">
      <Link
        href={order.source === "AUCTION" ? "/account/auctions" : "/cart"}
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        {order.source === "AUCTION" ? "Bids and wins" : "Cart"}
      </Link>
      <header className="grid gap-2">
        <h1 className="display text-5xl">{order.source === "AUCTION" ? "Pay for your winning lot" : "Checkout"}</h1>
        <p className="text-muted-foreground">
          {order.source === "AUCTION" && order.payDeadline
            ? `Pay by ${dateFmt.format(order.payDeadline)} to secure it. After that the lot goes back to the maker.`
            : order.paymentHoldUntil
              ? `We're holding these pieces for you until ${timeFmt.format(order.paymentHoldUntil)}.`
              : "We're holding these pieces for you while you pay."}
        </p>
      </header>

      {payment === "declined" && (
        <p role="alert" className="rounded-2xl border border-madder/30 bg-madder-soft px-5 py-4 font-medium text-madder">
          That payment didn&apos;t go through, and you haven&apos;t been charged. Try again, or choose another way to pay.
        </p>
      )}
      {payment === "pending" && (
        <p role="status" className="rounded-2xl border bg-saffron-soft px-5 py-4 font-medium text-saffron-ink dark:text-saffron">
          We haven&apos;t received a payment for this order yet, and you haven&apos;t been charged. If the payment page showed an error, try again or choose another way to pay.
        </p>
      )}

      {deadlinePassed ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">The payment deadline for this lot has passed.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <CheckoutSteps orderId={order.id} total={total} savedAddress={saved ? formatAddress(saved) : null} defaults={defaults} />

          <aside className="grid h-fit gap-4 rounded-[1.5rem] border bg-card p-6 lg:sticky lg:top-24">
            <h2 className="font-sans text-lg font-semibold tracking-normal">Your order</h2>
            <ul className="grid gap-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-indigo-soft">
                    {item.product.images[0] && <Image src={item.product.images[0].url} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="grid flex-1 gap-0.5 text-sm">
                    <span className="font-semibold">{item.titleSnapshot}</span>
                    <span className="text-muted-foreground">
                      {item.artisan.shopName}
                      {item.qty > 1 && `, ${item.qty} x ${formatCents(item.unitPriceCents)}`}
                    </span>
                  </div>
                  <span className="numeric text-sm font-semibold">{formatCents(item.unitPriceCents * item.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t pt-4">
              <span className="font-semibold">Total</span>
              <span className="display numeric text-3xl">{total}</span>
            </div>
            <p className="text-xs text-muted-foreground">Delivery within Bahrain is arranged by each maker.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
