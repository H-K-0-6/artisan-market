import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getMyShop } from "@/server/queries/dashboard";
import { listMyAuctions } from "@/server/queries/auctions";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuctionStatusBadge } from "@/components/auction/auction-status-badge";

export const metadata = { title: "Auctions" };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function MyAuctionsDashboardPage() {
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const auctions = await listMyAuctions(shop.id);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-4xl">Auctions</h1>
        <Link href="/dashboard/auctions/new" className={buttonVariants()}>
          New auction
        </Link>
      </div>
      {auctions.length === 0 ? (
        <p className="text-muted-foreground">No auctions yet. Schedule one for a one-off piece.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead className="text-right">Bids</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auctions.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/auctions/${a.id}`} className="hover:underline">
                    {a.product.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <AuctionStatusBadge status={a.status} />
                </TableCell>
                <TableCell className="text-sm">{dateFmt.format(a.startsAt)}</TableCell>
                <TableCell className="text-sm">{dateFmt.format(a.endsAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{a.bidCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(a.bidCount > 0 && a.currentPriceCents != null ? a.currentPriceCents : a.startPriceCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
