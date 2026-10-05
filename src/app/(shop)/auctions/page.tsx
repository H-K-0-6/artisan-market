import Link from "next/link";
import { prisma } from "@/lib/db";
import { listAuctions, type AuctionTab } from "@/server/queries/auctions";
import { AuctionCard } from "@/components/auction/auction-card";
import { LiveDot } from "@/components/brand/live";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Auctions" };

const TABS: { key: AuctionTab; label: string; empty: { title: string; body: string } }[] = [
  {
    key: "live",
    label: "Live now",
    empty: { title: "Nothing on the block right now", body: "New lots open regularly. See what's coming up and be ready when bidding starts." },
  },
  { key: "upcoming", label: "Coming up", empty: { title: "No lots scheduled yet", body: "Makers schedule lots ahead of time. Check back soon." } },
  { key: "ended", label: "Closed", empty: { title: "No closed lots yet", body: "Results from finished auctions will appear here." } },
];

export default async function AuctionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "live";
  const [auctions, counts] = await Promise.all([
    listAuctions(tab),
    prisma.auction.groupBy({ by: ["status"], _count: true, where: { status: { in: ["LIVE", "SCHEDULED", "ENDED", "PAID", "UNSOLD"] } } }),
  ]);
  const count = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  const tabCount: Record<AuctionTab, number> = {
    live: count(["LIVE"]),
    upcoming: count(["SCHEDULED"]),
    ended: count(["ENDED", "PAID", "UNSOLD"]),
  };
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="grid gap-10">
      <header className="grid gap-3">
        <h1 className="display text-5xl sm:text-6xl">Auctions</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          One-of-a-kind pieces, sold to the highest bidder. A bid in the final 2 minutes adds 2 more, so the clock never runs out on a
          live bidding war.
        </p>
      </header>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Auction status">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.key === "live" ? "/auctions" : `/auctions?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                active ? "border-indigo bg-indigo text-white dark:text-indigo-deep" : "bg-card hover:border-indigo/40 hover:text-indigo",
              )}
            >
              {t.key === "live" && tabCount.live > 0 && <LiveDot className="size-2" />}
              {t.label}
              <span className={cn("numeric rounded-full px-1.5 text-xs", active ? "bg-white/15" : "bg-muted text-muted-foreground")}>
                {tabCount[t.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {auctions.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-[1.5rem] border border-dashed p-10">
          <h2 className="display text-3xl">{current.empty.title}</h2>
          <p className="max-w-md text-muted-foreground">{current.empty.body}</p>
          {tab === "live" && tabCount.upcoming > 0 && (
            <Link href="/auctions?tab=upcoming" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See what&apos;s coming up
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {auctions.map((a) => (
            <AuctionCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
