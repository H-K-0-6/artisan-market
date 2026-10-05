import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { getAuctionDetail } from "@/server/queries/admin";
import { StatusBadge } from "@/components/admin/status-badge";
import { CancelAuctionButton } from "@/components/admin/moderation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Auction · Admin" };

const CANCELLABLE = new Set(["DRAFT", "SCHEDULED", "LIVE"]);

export default async function AdminAuctionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRolePage("admin");
  const { id } = await params;
  const a = await getAuctionDetail(id);
  if (!a) notFound();

  // ENDED auctions can still be cancelled while the winner's order is unpaid.
  const cancellable = CANCELLABLE.has(a.status) || (a.status === "ENDED" && (!a.order || a.order.status === "PENDING"));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link href="/admin/auctions" className="text-sm text-muted-foreground hover:underline">
            ← Auctions
          </Link>
          <h1 className="flex items-center gap-2 display text-4xl">
            {a.product.title} <StatusBadge status={a.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            by{" "}
            <Link href={`/admin/users/${a.artisan.user.id}`} className="underline">
              {a.artisan.shopName}
            </Link>{" "}
            ({a.artisan.user.email})
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/auctions/${a.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Public page
          </Link>
          {cancellable && <CancelAuctionButton auctionId={a.id} />}
        </div>
      </div>

      {a.cancelledReason && (
        <Card className="border-destructive/40">
          <CardContent className="text-sm">
            <span className="font-medium">Cancelled:</span> {a.cancelledReason}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Current price</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <span className="text-2xl font-semibold tabular-nums">
              {a.currentPriceCents != null ? formatCents(a.currentPriceCents) : "No bids"}
            </span>
            <span className="text-xs text-muted-foreground">
              start {formatCents(a.startPriceCents)} · increment {formatCents(a.minIncrementCents)} · {a.bidCount} bids
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Reserve (hidden from buyers)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <span className="text-2xl font-semibold tabular-nums">
              {a.reservePriceCents != null ? formatCents(a.reservePriceCents) : "None"}
            </span>
            {a.reservePriceCents != null && (
              <span className="text-xs text-muted-foreground">{a.reserveMet ? "Reserve met" : "Reserve not met"}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm tabular-nums">
            <span>Starts {formatDateTime(a.startsAt)}</span>
            <span>Ends {formatDateTime(a.endsAt)}</span>
            {a.endsAt.getTime() !== a.originalEndsAt.getTime() && (
              <span className="text-xs text-muted-foreground">originally {formatDateTime(a.originalEndsAt)} (extended)</span>
            )}
            {a.endedAt && <span className="text-xs text-muted-foreground">closed {formatDateTime(a.endedAt)}</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Winner &amp; order</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {a.winner ? (
            <div className="grid gap-1">
              <span>
                Winner:{" "}
                <Link href={`/admin/users/${a.winner.id}`} className="underline">
                  {a.winner.name}
                </Link>{" "}
                ({a.winner.email})
              </span>
              {a.order ? (
                <span className="flex flex-wrap items-center gap-2">
                  Order{" "}
                  <Link href={`/admin/orders/${a.order.id}`} className="font-mono text-xs underline">
                    {a.order.id.slice(-10)}
                  </Link>
                  <StatusBadge status={a.order.status} /> {formatCents(a.order.totalCents)}
                  {a.order.paidAt
                    ? ` · paid ${formatDateTime(a.order.paidAt)}`
                    : a.order.payDeadline
                      ? ` · pay by ${formatDateTime(a.order.payDeadline)}`
                      : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">No order created.</span>
              )}
            </div>
          ) : a.highBidder ? (
            <span>
              Leading bidder:{" "}
              <Link href={`/admin/users/${a.highBidder.id}`} className="underline">
                {a.highBidder.name}
              </Link>{" "}
              ({a.highBidder.email})
            </span>
          ) : (
            <span className="text-muted-foreground">No winner.</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bid history ({a.bids.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {a.bids.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bids yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Bidder</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.bids.map((b, i) => (
                  <TableRow key={b.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{a.bids.length - i}</TableCell>
                    <TableCell>
                      <Link href={`/admin/users/${b.bidder.id}`} className="hover:underline">
                        {b.bidder.name}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">{b.bidder.email}</span>
                      {b.bidder.banned && <Badge variant="destructive" className="ml-2">Banned</Badge>}
                      {i === 0 && <Badge className="ml-2">Highest</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(b.amountCents)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(b.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
