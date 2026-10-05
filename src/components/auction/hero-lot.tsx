"use client";

import Image from "next/image";
import Link from "next/link";
import { useLiveLot, type LotSnapshot } from "@/hooks/use-live-lot";
import { LotTicket } from "@/components/auction/lot-ticket";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Home page hero: the lot on the block right now, updating live. The ticket's
 * entrance (it slides in and settles at a slight angle) is the page's one
 * orchestrated motion moment.
 */
export function HeroLot(props: {
  auctionId: string;
  lotNumber: number;
  title: string;
  description: string;
  shopName: string;
  shopSlug: string;
  imageUrl: string | null;
  hasReserve: boolean;
  initial: LotSnapshot;
}) {
  const lot = useLiveLot(props.auctionId, props.initial);
  const live = lot.status === "LIVE";

  return (
    <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      <div className="order-2 grid gap-7 lg:order-1">
        <div className="grid gap-4">
          <p className="text-[0.95rem] font-semibold text-indigo">{live ? "On the block now" : "Next on the block"}</p>
          <h1 className="display text-5xl text-foreground sm:text-6xl xl:text-7xl">{props.title}</h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            By{" "}
            <Link href={`/shops/${props.shopSlug}`} className="font-semibold text-foreground underline decoration-saffron decoration-2 underline-offset-4">
              {props.shopName}
            </Link>
            . {props.description}
          </p>
        </div>

        <div className="relative max-w-md">
          <div className="animate-ticket-in origin-bottom-left">
            <LotTicket
              lotNumber={props.lotNumber}
              status={lot.status}
              priceCents={lot.displayPrice}
              hasBids={lot.hasBids}
              bidCount={lot.bidCount}
              reserve={!props.hasReserve ? "none" : lot.reserveMet ? "met" : "not-met"}
              msLeft={lot.msLeft}
              msToStart={lot.msToStart}
              extended={lot.extended}
              finalPriceCents={lot.result?.price}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/auctions/${props.auctionId}`} className={buttonVariants({ variant: live ? "bid" : "default", size: "lg" })}>
            {live ? "Bid on this lot" : "Preview this lot"}
          </Link>
          <Link href="/auctions" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            See every lot
          </Link>
        </div>
      </div>

      <Link
        href={`/auctions/${props.auctionId}`}
        className="group relative order-1 block aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-indigo-soft lg:order-2"
      >
        {props.imageUrl && (
          <Image
            src={props.imageUrl}
            alt={props.title}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        )}
        <span
          className={cn(
            "absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold backdrop-blur",
            lot.connected ? "bg-card/85 text-foreground" : "bg-madder-soft/90 text-madder",
          )}
        >
          <span className={cn("size-2 rounded-full", lot.connected ? "bg-weld" : "bg-madder")} />
          {lot.connected ? "Updating live" : "Reconnecting"}
        </span>
      </Link>
    </section>
  );
}
