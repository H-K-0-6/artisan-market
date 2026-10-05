import Image from "next/image";
import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getMyShop } from "@/server/queries/dashboard";
import { getMyAuction } from "@/server/queries/auctions";
import { maskName } from "@/server/services/bid.rules";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuctionStatusBadge } from "@/components/auction/auction-status-badge";
import { CancelAuctionButton } from "@/components/dashboard/cancel-auction-button";

export const metadata = { title: "Auction" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

export default async function MyAuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const a = await getMyAuction(shop.id, id);
  const img = a.product.images[0];
  const cancellable = a.status === "DRAFT" || a.status === "SCHEDULED";

  return (
    <div className="grid gap-6">
      <Link href="/dashboard/auctions" className="text-sm text-muted-foreground hover:underline">
        ← Auctions
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative size-24 overflow-hidden rounded-lg bg-muted">
          {img && <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />}
        </div>
        <div className="grid flex-1 gap-1">
          <h1 className="display text-4xl">{a.product.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <AuctionStatusBadge status={a.status} />
            <Link href={`/auctions/${a.id}`} className="underline">
              View public page
            </Link>
          </div>
        </div>
        {cancellable && <CancelAuctionButton auctionId={a.id} />}
      </div>

      {a.cancelledReason && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{a.cancelledReason}</p>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm md:grid-cols-4">
        <Stat label="Start price" value={formatCents(a.startPriceCents)} />
        <Stat label="Min increment" value={formatCents(a.minIncrementCents)} />
        <Stat
          label="Reserve"
          value={a.reservePriceCents != null ? `${formatCents(a.reservePriceCents)} (${a.reserveMet ? "met" : "not met"})` : "None"}
        />
        <Stat label="Current price" value={a.currentPriceCents != null ? formatCents(a.currentPriceCents) : "No bids"} />
        <Stat label="Starts" value={dateFmt.format(a.startsAt)} />
        <Stat label="Ends" value={dateFmt.format(a.endsAt)} />
        <Stat label="Original end" value={dateFmt.format(a.originalEndsAt)} />
        <Stat label="Bids" value={String(a.bidCount)} />
      </dl>

      {a.order && (
        <div className="grid gap-1 rounded-lg border p-4 text-sm">
          <div className="font-medium">Winner&apos;s order</div>
          <div>
            Status: {a.order.status.toLowerCase()} · total {formatCents(a.order.totalCents)} · commission{" "}
            {formatCents(a.order.commissionCents)} · you receive {formatCents(a.order.totalCents - a.order.commissionCents)}
          </div>
          {a.order.status === "PENDING" && a.order.payDeadline && (
            <div className="text-muted-foreground">Payment due by {dateFmt.format(a.order.payDeadline)}</div>
          )}
        </div>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Bid history</h2>
        {a.bids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bids yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bidder</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.bids.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{maskName(b.bidder.name)}</TableCell>
                  <TableCell className="text-sm">{dateFmt.format(b.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(b.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
