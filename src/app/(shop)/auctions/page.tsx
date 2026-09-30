import Link from "next/link";
import { listAuctions, type AuctionTab } from "@/server/queries/auctions";
import { AuctionCard } from "@/components/auction/auction-card";
import { cn } from "cn";

export const metadata = { title: "Auctions" };

const TABS: { key: AuctionTab; label: string; empty: string }[] = [
  { key: "live", label: "Live now", empty: "No auctions are live right now. Check the upcoming tab." },
  { key: "upcoming", label: "Upcoming", empty: "Nothing scheduled yet." },
  { key: "ended", label: "Ended", empty: "No finished auctions yet." },
];

export default async function AuctionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "live";
  const auctions = await listAuctions(tab);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Auctions</h1>
        <p className="text-muted-foreground">One-off pieces, live bidding. Late bids extend the clock, so there&apos;s no sniping.</p>
      </div>
      <nav className="inline-flex w-fit rounded-lg bg-muted p-[3px] text-sm" aria-label="Auction status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "live" ? "/auctions" : `/auctions?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 font-medium text-foreground/60 hover:text-foreground",
              t.key === tab && "bg-background text-foreground shadow-sm",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {auctions.length === 0 ? (
        <p className="text-muted-foreground">{TABS.find((t) => t.key === tab)!.empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {auctions.map((a) => (
            <AuctionCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
