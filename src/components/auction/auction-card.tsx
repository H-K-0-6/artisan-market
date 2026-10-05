import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { LiveDot, lotLabel } from "@/components/brand/live";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type CardAuction = {
  id: string;
  lotNumber: number;
  status: string;
  startsAt: Date;
  endsAt: Date;
  bidCount: number;
  currentPriceCents: number | null;
  startPriceCents: number;
  product: { title: string; images: { url: string }[] };
  artisan: { shopName: string };
};

const STRIP: Record<string, string> = {
  LIVE: "bg-saffron text-saffron-ink",
  SCHEDULED: "bg-indigo text-white dark:text-indigo-deep",
  ENDED: "bg-weld text-white dark:text-indigo-deep",
  PAID: "bg-weld text-white dark:text-indigo-deep",
  UNSOLD: "bg-muted text-muted-foreground",
};

/** An auction lot: photo with a ticket strip carrying the lot number and price. */
export function AuctionCard({ a }: { a: CardAuction }) {
  const img = a.product.images[0];
  const hasBids = a.bidCount > 0 && a.currentPriceCents != null;
  const sold = a.status === "ENDED" || a.status === "PAID";

  const priceLine =
    a.status === "SCHEDULED" || (a.status === "LIVE" && !hasBids)
      ? `Opening bid ${formatCents(a.startPriceCents)}`
      : a.status === "LIVE"
        ? formatCents(a.currentPriceCents!)
        : sold
          ? `Sold for ${formatCents(a.currentPriceCents ?? 0)}`
          : "Closed, unsold";
  const whenLine =
    a.status === "SCHEDULED"
      ? `Opens ${timeFmt.format(a.startsAt)}`
      : a.status === "LIVE"
        ? `${a.bidCount} ${a.bidCount === 1 ? "bid" : "bids"}, closes ${timeFmt.format(a.endsAt)}`
        : null;

  return (
    <Link href={`/auctions/${a.id}`} className="group grid content-start gap-3 rounded-2xl focus-visible:outline-offset-4">
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_var(--border)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-indigo-soft">
          {img && (
            <Image
              src={img.url}
              alt={a.product.title}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className={cn("object-cover transition-transform duration-500 group-hover:scale-[1.04]", a.status === "UNSOLD" && "grayscale-[0.6]")}
            />
          )}
        </div>
        <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13px] font-semibold sm:text-sm", STRIP[a.status] ?? STRIP.UNSOLD)}>
          <span className="numeric">{lotLabel(a.lotNumber)}</span>
          <span className="inline-flex items-center gap-2">
            {a.status === "LIVE" && <LiveDot className="[&>span]:bg-saffron-ink" />}
            <span className="numeric">{priceLine}</span>
          </span>
        </div>
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 className="font-sans text-[0.95rem] font-semibold leading-snug tracking-normal group-hover:text-indigo">{a.product.title}</h3>
        <p className="text-sm text-muted-foreground">
          {a.artisan.shopName}
          {whenLine && <span className="block text-xs">{whenLine}</span>}
        </p>
      </div>
    </Link>
  );
}
