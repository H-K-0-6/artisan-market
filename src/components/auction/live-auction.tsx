"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ServerEvents } from "@/server/realtime/emit";
import { placeBidAction } from "@/server/actions/bid";
import { formatCents, parseAmount, toMajorString } from "@/lib/money";
import { agoFromMs } from "@/lib/time";
import { useLiveLot, type LotStatus } from "@/hooks/use-live-lot";
import { LotTicket } from "@/components/auction/lot-ticket";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type BidRow = { key: string; alias: string; amountCents: number; at: number; mine: boolean; fresh?: boolean };

export type LiveAuctionProps = {
  auctionId: string;
  lotNumber: number;
  title: string;
  initial: {
    status: LotStatus;
    currentPriceCents: number | null;
    minNextBidCents: number;
    minIncrementCents: number;
    bidCount: number;
    reserveMet: boolean;
    hasReserve: boolean;
    startsAt: string;
    endsAt: string;
    serverNow: number;
  };
  bids: { id: string; alias: string; amountCents: number; createdAt: string; mine: boolean }[];
  viewer: { signedIn: boolean; canBid: boolean; reason?: string };
  /** Set when the viewer won this auction. */
  myOrder: { id: string; status: string; payDeadline: string | null } | null;
  /** The viewer's bid when they're currently the high bidder. */
  myHighBidCents: number | null;
};

export function LiveAuction(props: LiveAuctionProps) {
  const { auctionId, initial } = props;
  const myAmounts = useRef(new Set<number>(props.bids.filter((b) => b.mine).map((b) => b.amountCents)));
  const [bids, setBids] = useState<BidRow[]>(() =>
    props.bids.map((b) => ({ key: b.id, alias: b.alias, amountCents: b.amountCents, at: Date.parse(b.createdAt), mine: b.mine })),
  );
  const [myHigh, setMyHigh] = useState(props.myHighBidCents);
  const [wonOrderId, setWonOrderId] = useState<string | null>(props.myOrder?.id ?? null);

  // Stable handlers so the socket subscription isn't torn down every render.
  const onBid = useCallback((p: ServerEvents["bid:placed"]) => {
    setBids((prev) =>
      prev.some((b) => b.amountCents === p.amountCents)
        ? prev
        : [
            { key: `${p.amountCents}`, alias: p.bidderAlias, amountCents: p.amountCents, at: p.serverNow, mine: myAmounts.current.has(p.amountCents), fresh: true },
            ...prev,
          ].slice(0, 30),
    );
  }, []);
  const onStarted = useCallback(() => toast("Bidding is open", { description: "This lot is now live." }), []);
  const onExtended = useCallback(() => toast("Two more minutes", { description: "A late bid extended the clock." }), []);
  // The AUCTION_WON notification is toasted by the global bell; here we just show Pay.
  const onWon = useCallback((p: ServerEvents["auction:won"]) => setWonOrderId(p.orderId), []);

  const lot = useLiveLot(auctionId, initial, { onBid, onStarted, onExtended, onWon });
  const iAmHigh = myHigh != null && lot.price === myHigh && (lot.status === "LIVE" || lot.status === "ENDED");

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={cn("inline-flex items-center gap-2 font-medium", lot.connected ? "text-muted-foreground" : "text-madder")}>
          <span className={cn("size-2 rounded-full", lot.connected ? "bg-weld" : "bg-madder")} />
          {lot.connected ? "Updating live" : "Reconnecting"}
        </span>
        {iAmHigh && lot.status === "LIVE" && (
          <span className="rounded-full bg-weld-soft px-3 py-1 text-xs font-semibold text-weld">You&apos;re the high bidder</span>
        )}
      </div>

      <LotTicket
        lotNumber={props.lotNumber}
        status={lot.status}
        priceCents={lot.displayPrice}
        hasBids={lot.hasBids}
        bidCount={lot.bidCount}
        reserve={!initial.hasReserve ? "none" : lot.reserveMet ? "met" : "not-met"}
        msLeft={lot.msLeft}
        msToStart={lot.msToStart}
        extended={lot.extended}
        finalPriceCents={lot.result?.price}
      />

      <Outcome status={lot.status} wonOrderId={wonOrderId} myOrder={props.myOrder} />

      {lot.status === "LIVE" && (
        <BidForm
          auctionId={auctionId}
          minNext={lot.minNext}
          increment={initial.minIncrementCents}
          viewer={props.viewer}
          iAmHigh={iAmHigh}
          onPlaced={(amount) => {
            myAmounts.current.add(amount);
            setMyHigh(amount);
            setBids((prev) => prev.map((b) => (b.amountCents === amount ? { ...b, mine: true } : b)));
          }}
        />
      )}
      {lot.status === "SCHEDULED" && (
        <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          {props.viewer.signedIn ? (
            "Bidding opens when the clock above reaches zero. Keep this page open and it will update by itself."
          ) : (
            <>
              <Link href={`/sign-in?next=/auctions/${auctionId}`} className="font-semibold text-indigo underline underline-offset-4">
                Sign in
              </Link>{" "}
              before it opens so you&apos;re ready to bid.
            </>
          )}
        </div>
      )}

      <section className="grid gap-3" aria-labelledby="bids-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="bids-heading" className="font-sans text-base font-semibold tracking-normal">
            Bids
          </h2>
          <span className="text-xs text-muted-foreground">Bidder names are shortened for privacy</span>
        </div>
        {bids.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
            {lot.status === "LIVE" ? "No bids yet. The opening bid takes the lead." : "No bids were placed."}
          </p>
        ) : (
          <ol className="grid overflow-hidden rounded-2xl border bg-card text-sm" data-testid="bid-list">
            {bids.slice(0, 12).map((b, i) => (
              <li
                key={b.key}
                className={cn(
                  "flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0",
                  i === 0 && "bg-saffron-soft/70",
                  b.fresh && "animate-in fade-in slide-in-from-top-2 duration-500",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-saffron text-saffron-ink" : "bg-muted text-muted-foreground")}>
                    {b.alias.slice(0, 1)}
                  </span>
                  <span className="font-medium">{b.alias}</span>
                  {b.mine && <span className="rounded-full bg-indigo-soft px-2 py-0.5 text-[11px] font-semibold text-indigo">You</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{lot.serverNow == null ? "" : agoFromMs(lot.serverNow - b.at)}</span>
                  <span className="numeric font-semibold">{formatCents(b.amountCents)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Outcome(props: { status: LotStatus; wonOrderId: string | null; myOrder: LiveAuctionProps["myOrder"] }) {
  const { status, wonOrderId } = props;
  if ((status !== "ENDED" && status !== "PAID") || !wonOrderId) return null;
  const orderStatus = status === "PAID" ? "PAID" : (props.myOrder?.status ?? "PENDING");
  const deadline = props.myOrder?.payDeadline ? new Date(props.myOrder.payDeadline) : null;
  return (
    <div className="grid gap-3 rounded-2xl border border-weld/30 bg-weld-soft p-5" data-testid="outcome">
      <div className="display text-2xl text-weld">You won this lot</div>
      <p className="text-sm">
        {orderStatus === "PENDING"
          ? deadline
            ? `Pay by ${deadline.toLocaleString()} to secure it. After that it goes back to the maker.`
            : "Pay within 48 hours to secure it."
          : orderStatus === "PAID"
            ? "Payment received. The maker will let you know when it ships."
            : `This order is ${orderStatus.toLowerCase()}.`}
      </p>
      {orderStatus === "PENDING" && (
        <a href={`/pay/${wonOrderId}`} className={cn(buttonVariants({ size: "lg" }), "w-fit")} data-testid="pay-now">
          Pay now
        </a>
      )}
    </div>
  );
}

function BidForm(props: {
  auctionId: string;
  minNext: number;
  increment: number;
  viewer: LiveAuctionProps["viewer"];
  iAmHigh: boolean;
  onPlaced: (amountCents: number) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeholder = useMemo(() => toMajorString(props.minNext), [props.minNext]);

  if (!props.viewer.signedIn) {
    return (
      <div className="grid gap-3 rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">Sign in to bid. It takes a minute and you&apos;ll keep your place on this page.</p>
        <Link href={`/sign-in?next=/auctions/${props.auctionId}`} className={buttonVariants({ variant: "bid", size: "lg", className: "w-fit" })}>
          Sign in to bid
        </Link>
      </div>
    );
  }
  if (!props.viewer.canBid) {
    return <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">{props.viewer.reason}</div>;
  }

  function submit(amountCents: number | null) {
    if (amountCents == null || amountCents <= 0) {
      setError("Enter an amount in dinars, like 120 or 120.500.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await placeBidAction(props.auctionId, amountCents);
      if (res.ok) {
        props.onPlaced(res.bid.amountCents);
        setValue("");
        toast.success(`You bid ${formatCents(res.bid.amountCents)}`, { description: "We'll tell you if someone outbids you." });
        return;
      }
      if (res.code === "TOO_LOW" && res.minCents) {
        setError(`Someone got there first. The lowest bid is now ${formatCents(res.minCents)}.`);
        setValue(toMajorString(res.minCents));
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form
      className="grid gap-3 rounded-2xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value.trim() === "" ? props.minNext : parseAmount(value));
      }}
    >
      <Label htmlFor="bid-amount" className="text-sm font-semibold">
        Your bid (min {formatCents(props.minNext)})
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg font-semibold text-muted-foreground">BD</span>
          <Input
            id="bid-amount"
            name="amount"
            inputMode="decimal"
            className="numeric h-12 pl-12 text-lg font-semibold"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "bid-error" : undefined}
          />
        </div>
        <Button type="submit" variant="bid" size="lg" className="h-12 px-6" disabled={pending || props.iAmHigh}>
          {pending ? "Bidding…" : "Place bid"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 4].map((steps) => {
          const amt = props.minNext + steps * props.increment;
          return (
            <Button key={steps} type="button" variant="outline" size="sm" className="numeric rounded-full" disabled={pending || props.iAmHigh} onClick={() => submit(amt)}>
              Bid {formatCents(amt)}
            </Button>
          );
        })}
      </div>
      {props.iAmHigh && <p className="text-sm text-weld">You&apos;re winning. We&apos;ll let you know if someone outbids you.</p>}
      {error && (
        <p id="bid-error" role="alert" className="text-sm font-medium text-madder" data-testid="bid-error">
          {error}
        </p>
      )}
    </form>
  );
}
