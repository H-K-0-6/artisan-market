import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import type { AuctionCardData } from "@/server/queries/auctions";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Auction tile in the same style as the storefront product cards. */
export function AuctionCard({ a }: { a: AuctionCardData }) {
  const img = a.product.images[0];
  const price = a.bidCount > 0 && a.currentPriceCents != null ? a.currentPriceCents : null;
  return (
    <Link href={`/auctions/${a.id}`} className="group grid gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {img && <Image src={img.url} alt={a.product.title} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition group-hover:scale-105" />}
        <Badge className="absolute left-2 top-2" variant={a.status === "LIVE" ? "default" : "secondary"}>
          {a.status === "LIVE" ? "LIVE" : a.status === "SCHEDULED" ? "Upcoming" : a.status === "UNSOLD" ? "Unsold" : "Sold"}
        </Badge>
      </div>
      <div className="text-sm font-medium">{a.product.title}</div>
      <div className="text-sm text-muted-foreground">
        {a.status === "SCHEDULED"
          ? `Starts ${dateFmt.format(a.startsAt)} · from ${formatCents(a.startPriceCents)}`
          : a.status === "LIVE"
            ? price != null
              ? `Current bid ${formatCents(price)} · ${a.bidCount} ${a.bidCount === 1 ? "bid" : "bids"}`
              : `Starts at ${formatCents(a.startPriceCents)}`
            : a.status === "UNSOLD"
              ? "Ended without a sale"
              : `Sold for ${formatCents(a.currentPriceCents ?? 0)}`}
      </div>
      <div className="text-xs text-muted-foreground">{a.artisan.shopName}</div>
    </Link>
  );
}
