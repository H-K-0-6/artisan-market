import { requireRolePage } from "@/lib/rbac";
import { commissionCents, formatCents } from "@/lib/money";
import { getMyShop } from "@/server/queries/dashboard";
import { formatAddress, listShopOrderItems } from "@/server/queries/orders";
import { ShipItemForm } from "@/components/dashboard/ship-item-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Orders" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function ShopOrdersPage() {
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const items = await listShopOrderItems(shop.id);

  const rows = items.map((item) => {
    const gross = item.unitPriceCents * item.qty;
    const commission = commissionCents(gross, shop.commissionBps);
    return { item, gross, commission, net: gross - commission };
  });
  const toShip = rows.filter((r) => !r.item.shippedAt).length;
  const totals = rows.reduce((t, r) => ({ gross: t.gross + r.gross, net: t.net + r.net }), { gross: 0, net: 0 });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {toShip} to ship · Sales {formatCents(totals.gross)} · Net after {shop.commissionBps / 100}% commission{" "}
          {formatCents(totals.net)}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No paid orders yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Ship to</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Fulfilment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, gross, commission, net }) => (
              <TableRow key={item.id} className="align-top">
                <TableCell className="whitespace-normal">
                  <div className="font-medium">
                    {item.titleSnapshot} {item.qty > 1 && <span className="text-muted-foreground">×{item.qty}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    #{item.order.id.slice(-8).toUpperCase()}
                    {item.order.paidAt && <> · paid {dateFmt.format(item.order.paidAt)}</>}
                    {item.order.source === "AUCTION" && <> · auction</>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal text-xs">
                  {formatAddress(item.order.shippingAddress).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  <div className="text-muted-foreground">{item.order.buyer.email}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(gross)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">−{formatCents(commission)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCents(net)}</TableCell>
                <TableCell>
                  {item.shippedAt ? (
                    <div className="grid gap-1">
                      <Badge variant="secondary">Shipped {dateFmt.format(item.shippedAt)}</Badge>
                      {item.trackingNo && <span className="text-xs text-muted-foreground">{item.trackingNo}</span>}
                    </div>
                  ) : (
                    <ShipItemForm orderItemId={item.id} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
