import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { commissionCents, formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { getOrderDetail } from "@/server/queries/admin";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Order · Admin" };

type Address = { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };

const PAYMENT_METHOD_LABEL: Record<string, string> = { BENEFIT: "BENEFIT debit card", BENEFITPAY: "BenefitPay", CARD: "Card" };

function AddressBlock({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <span className="text-muted-foreground">Not collected yet.</span>;
  const a = value as Address & { address?: Address; phone?: string };
  const addr = a.address ?? a; // stored as { name, phone, address: {...} }
  return (
    <address className="not-italic leading-relaxed">
      {a.name && <div>{a.name}</div>}
      {a.phone && <div>{a.phone}</div>}
      {addr.line1 && <div>{addr.line1}</div>}
      {addr.line2 && <div>{addr.line2}</div>}
      <div>{[addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ")}</div>
      {addr.country && <div>{addr.country}</div>}
    </address>
  );
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRolePage("admin");
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  // Group line items by artisan: each shop fulfils (and is paid out for) its own items.
  const groups = new Map<string, { shop: (typeof order.items)[number]["artisan"]; items: typeof order.items }>();
  for (const item of order.items) {
    const g = groups.get(item.artisanId) ?? { shop: item.artisan, items: [] };
    g.items.push(item);
    groups.set(item.artisanId, g);
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
          ← Orders
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 display text-4xl">
          Order <span className="font-mono text-lg">{order.id}</span> <StatusBadge status={order.status} />
          <Badge variant="outline">{order.source === "AUCTION" ? "Auction" : "Cart"}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Placed {formatDateTime(order.createdAt)} by{" "}
          <Link href={`/admin/users/${order.buyer.id}`} className="underline">
            {order.buyer.name}
          </Link>{" "}
          ({order.buyer.email})
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
              <dt>Subtotal</dt>
              <dd className="text-right">{formatCents(order.subtotalCents)}</dd>
              <dt>Platform commission</dt>
              <dd className="text-right">{formatCents(order.commissionCents)}</dd>
              <dt>Artisan payouts</dt>
              <dd className="text-right">{formatCents(order.subtotalCents - order.commissionCents)}</dd>
              <dt className="font-medium">Charged</dt>
              <dd className="text-right font-medium">{formatCents(order.totalCents)}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <span>Paid: {order.paidAt ? formatDateTime(order.paidAt) : "—"}</span>
            {order.payDeadline && <span>Pay deadline: {formatDateTime(order.payDeadline)}</span>}
            <span>Method: {order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod : "—"}</span>
            <span className="break-all">
              Tap charge: <span className="font-mono text-xs">{order.paidChargeId ?? order.paymentChargeId ?? "—"}</span>
            </span>
            {order.auction && (
              <span>
                Auction:{" "}
                <Link href={`/admin/auctions/${order.auction.id}`} className="underline">
                  view
                </Link>
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Shipping address</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <AddressBlock value={order.shippingAddress} />
          </CardContent>
        </Card>
      </div>

      {[...groups.values()].map(({ shop, items }) => {
        const gross = items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
        const fee = commissionCents(gross, shop.commissionBps);
        return (
          <Card key={shop.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`/admin/users/${shop.userId}`} className="hover:underline">
                  {shop.shopName}
                </Link>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {(shop.commissionBps / 100).toFixed(1)}% commission
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Line</TableHead>
                    <TableHead>Fulfilment</TableHead>
                    <TableHead>Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link href={`/admin/products?q=${i.product.id}`} className="hover:underline">
                          {i.titleSnapshot}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(i.unitPriceCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(i.unitPriceCents * i.qty)}</TableCell>
                      <TableCell className="text-sm">
                        {i.shippedAt ? (
                          <>
                            Shipped {formatDateTime(i.shippedAt)}
                            {i.trackingNo && <span className="block font-mono text-xs text-muted-foreground">{i.trackingNo}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not shipped</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={i.payoutStatus === "PAID_OUT" ? "default" : "secondary"}>
                          {i.payoutStatus === "PAID_OUT" ? "Paid out" : "Pending"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Shop total · commission {formatCents(fee)} · payout {formatCents(gross - fee)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(gross)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
