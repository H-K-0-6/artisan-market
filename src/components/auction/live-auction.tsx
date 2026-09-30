"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { getSocket, useSocketConnected } from "@/lib/socket-client";
import type { ServerEvents } from "@/server/realtime/emit";
import { placeBidAction } from "@/server/actions/bid";
import { formatCents, parseDollars } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

type Status = "SCHEDULED" | "LIVE" | "ENDED" | "PAID" | "UNSOLD" | "CANCELLED";
type BidRow = { key: string; alias: string; amountCents: number; at: number; mine: boolean };

export type LiveAuctionProps = {
  auctionId: string;
  title: string;
  initial: {
    status: Status;
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
  const connected = useSocketConnected();

  const [status, setStatus] = useState<Status>(initial.status);
  const [price, setPrice] = useState(initial.currentPriceCents);
  const [minNext, setMinNext] = useState(initial.minNextBidCents);
  const [bidCount, setBidCount] = useState(initial.bidCount);
  const [reserveMet, setReserveMet] = useState(initial.reserveMet);
  const [startsAt, setStartsAt] = useState(Date.parse(initial.startsAt));
  const [endsAt, setEndsAt] = useState(Date.parse(initial.endsAt));
  // Server clock minus local clock (ms). Refreshed from every event's serverNow.
  const [offset, setOffset] = useState(() => initial.serverNow - Date.now());
  const [bids, setBids] = useState<BidRow[]>(() =>
    props.bids.map((b) => ({ key: b.id, alias: b.alias, amountCents: b.amountCents, at: Date.parse(b.createdAt), mine: b.mine })),
  );
  const [myHigh, setMyHigh] = useState(props.myHighBidCents);
  const [result, setResult] = useState<{ kind: "SOLD" | "UNSOLD" | "CANCELLED"; price: number | null } | null>(null);
  const [wonOrderId, setWonOrderId] = useState<string | null>(props.myOrder?.id ?? null);
  const [extendedFlash, setExtendedFlash] = useState(false);
  // null until mounted, so the server render never prints a clock that hydration would contradict.
  const [now, setNow] = useState<number | null>(null);
  const myAmounts = useRef(new Set<number>(props.bids.filter((b) => b.mine).map((b) => b.amountCents)));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Room membership + live events. Re-join on every (re)connect.
  useEffect(() => {
    const s = getSocket();
    const sync = (serverNow: number) => setOffset(serverNow - Date.now());
    const mine = <T extends { auctionId: string }>(fn: (p: T) => void) => (p: T) => {
      if (p.auctionId === auctionId) fn(p);
    };

    const join = () => s.emit("auction:join", auctionId);
    const onState = mine((p: ServerEvents["auction:state"]) => {
      sync(p.serverNow);
      setStatus(p.status as Status);
      setPrice(p.currentPriceCents);
      setMinNext(p.minNextBidCents);
      setBidCount(p.bidCount);
      setReserveMet(p.reserveMet);
      setEndsAt(Date.parse(p.endsAt));
      if (p.startsAt) setStartsAt(Date.parse(p.startsAt));
    });
    const onStarted = mine((p: ServerEvents["auction:started"]) => {
      sync(p.serverNow);
      setStatus("LIVE");
      setEndsAt(Date.parse(p.endsAt));
      toast.info("The auction is live. Bidding is open!");
    });
    const onBid = mine((p: ServerEvents["bid:placed"]) => {
      sync(p.serverNow);
      setPrice((prev) => (prev == null || p.amountCents > prev ? p.amountCents : prev));
      setMinNext((prev) => Math.max(prev, p.minNextBidCents));
      setBidCount((prev) => Math.max(prev, p.bidCount));
      setReserveMet((prev) => prev || p.reserveMet);
      setEndsAt((prev) => Math.max(prev, Date.parse(p.endsAt)));
      setBids((prev) =>
        prev.some((b) => b.amountCents === p.amountCents)
          ? prev
          : [{ key: `${p.amountCents}`, alias: p.bidderAlias, amountCents: p.amountCents, at: p.serverNow, mine: myAmounts.current.has(p.amountCents) }, ...prev].slice(0, 30),
      );
    });
    const onExtended = mine((p: ServerEvents["auction:extended"]) => {
      sync(p.serverNow);
      setEndsAt((prev) => Math.max(prev, Date.parse(p.endsAt)));
      setExtendedFlash(true);
      setTimeout(() => setExtendedFlash(false), 2500);
      toast.info("Late bid: the auction was extended by 2 minutes");
    });
    const onEnded = mine((p: ServerEvents["auction:ended"]) => {
      setStatus(p.result === "SOLD" ? "ENDED" : p.result === "UNSOLD" ? "UNSOLD" : "CANCELLED");
      setResult({ kind: p.result, price: p.finalPriceCents });
    });
    // bid:outbid needs no handler here: the stored OUTBID notification is toasted by the
    // global notification bell, and "You're the high bidder" is derived from the price.
    const onWon = mine((p: ServerEvents["auction:won"]) => {
      // The AUCTION_WON notification is toasted by the global bell; just show the Pay button.
      setWonOrderId(p.orderId);
    });

    s.on("connect", join);
    s.on("auction:state", onState);
    s.on("auction:started", onStarted);
    s.on("bid:placed", onBid);
    s.on("auction:extended", onExtended);
    s.on("auction:ended", onEnded);
    s.on("auction:won", onWon);
    if (s.connected) join();

    return () => {
      s.emit("auction:leave", auctionId);
      s.off("connect", join);
      s.off("auction:state", onState);
      s.off("auction:started", onStarted);
      s.off("bid:placed", onBid);
      s.off("auction:extended", onExtended);
      s.off("auction:ended", onEnded);
      s.off("auction:won", onWon);
    };
  }, [auctionId]);

  const serverNow = now == null ? null : now + offset;
  const iAmHigh = myHigh != null && price === myHigh && (status === "LIVE" || status === "ENDED");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} closing={status === "LIVE" && serverNow != null && endsAt <= serverNow} />
        <span className={cn("flex items-center gap-1.5 text-xs", connected ? "text-muted-foreground" : "text-destructive")}>
          <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} />
          {connected ? "Live updates on" : "Reconnecting…"}
        </span>
      </div>

      <div className="grid gap-1 rounded-xl border p-5">
        <div className="text-sm text-muted-foreground">{price != null && bidCount > 0 ? "Current bid" : "Starting bid"}</div>
        <div className="text-4xl font-semibold tabular-nums" data-testid="current-price">
          {formatCents(price != null && bidCount > 0 ? price : minNext)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span data-testid="bid-count">
            {bidCount} {bidCount === 1 ? "bid" : "bids"}
          </span>
          <span>
            {!initial.hasReserve ? "No reserve" : reserveMet ? (
              <span className="text-emerald-600">Reserve met</span>
            ) : (
              "Reserve not met"
            )}
          </span>
          {iAmHigh && status === "LIVE" && <span className="font-medium text-emerald-600">You&apos;re the high bidder</span>}
        </div>
      </div>

      <Timer status={status} startsAt={startsAt} endsAt={endsAt} serverNow={serverNow} flash={extendedFlash} />

      <Outcome
        status={status}
        result={result}
        finalPrice={result?.price ?? price}
        wonOrderId={wonOrderId}
        myOrder={props.myOrder}
        iWon={wonOrderId != null}
      />

      {status === "LIVE" && (
        <BidForm
          auctionId={auctionId}
          minNext={minNext}
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
      {status === "SCHEDULED" && !props.viewer.signedIn && (
        <p className="text-sm text-muted-foreground">
          <Link href={`/sign-in?next=/auctions/${auctionId}`} className="underline">Sign in</Link> before it starts to bid.
        </p>
      )}

      <section className="grid gap-2">
        <h2 className="font-medium">Recent bids</h2>
        {bids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bids yet.</p>
        ) : (
          <ul className="grid divide-y rounded-lg border text-sm" data-testid="bid-list">
            {bids.slice(0, 15).map((b, i) => (
              <li key={b.key} className={cn("flex items-center justify-between px-3 py-2", i === 0 && "bg-muted/50")}>
                <span>
                  {b.alias}
                  {b.mine && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{serverNow == null ? "" : ago(serverNow - b.at)}</span>
                  <span className="font-medium tabular-nums">{formatCents(b.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status, closing }: { status: Status; closing: boolean }) {
  if (closing) return <Badge variant="secondary">Closing…</Badge>;
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    LIVE: { label: "LIVE", variant: "default" },
    SCHEDULED: { label: "Upcoming", variant: "secondary" },
    ENDED: { label: "Sold", variant: "outline" },
    PAID: { label: "Sold", variant: "outline" },
    UNSOLD: { label: "Ended, unsold", variant: "secondary" },
    CANCELLED: { label: "Cancelled", variant: "destructive" },
  };
  return <Badge variant={map[status].variant}>{map[status].label}</Badge>;
}

function Timer(props: { status: Status; startsAt: number; endsAt: number; serverNow: number | null; flash: boolean }) {
  const { status, startsAt, endsAt, flash } = props;
  const serverNow = props.serverNow ?? Number.NaN;
  const duration = (ms: number) => (Number.isNaN(ms) ? "--:--" : formatDuration(ms));
  if (status === "SCHEDULED") {
    const left = startsAt - serverNow;
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm text-muted-foreground">Starts in</div>
        <div className="text-2xl font-semibold tabular-nums">{left > 0 || Number.isNaN(left) ? duration(left) : "Starting…"}</div>
        <div className="text-xs text-muted-foreground" suppressHydrationWarning>{new Date(startsAt).toLocaleString()}</div>
      </div>
    );
  }
  if (status !== "LIVE") return null;
  const left = endsAt - serverNow;
  const urgent = left < 2 * 60 * 1000;
  const closing = left <= 0; // NaN (not mounted yet) is not closing
  return (
    <div className={cn("rounded-xl border p-4 transition-colors", flash && "border-amber-500 bg-amber-50 dark:bg-amber-950/30")}>
      <div className="text-sm text-muted-foreground">Time left</div>
      <div className={cn("text-2xl font-semibold tabular-nums", urgent && !closing && "text-destructive")} data-testid="time-left">
        {closing ? "Closing…" : duration(left)}
      </div>
      <div className="text-xs text-muted-foreground" suppressHydrationWarning>
        Ends {new Date(endsAt).toLocaleTimeString()}. Bids in the last 2 minutes extend the clock.
      </div>
    </div>
  );
}

function Outcome(props: {
  status: Status;
  result: { kind: string } | null;
  finalPrice: number | null;
  wonOrderId: string | null;
  myOrder: LiveAuctionProps["myOrder"];
  iWon: boolean;
}) {
  const { status } = props;
  if (status === "ENDED" || status === "PAID") {
    const orderStatus = props.myOrder?.status ?? "PENDING";
    return (
      <div className="grid gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 dark:bg-emerald-950/30" data-testid="outcome">
        <div className="font-medium">
          Sold{props.finalPrice != null ? ` for ${formatCents(props.finalPrice)}` : ""}
        </div>
        {props.iWon && (
          <>
            <p className="text-sm">
              You won this auction!{" "}
              {orderStatus === "PENDING"
                ? props.myOrder?.payDeadline
                  ? `Pay by ${new Date(props.myOrder.payDeadline).toLocaleString()} to secure it.`
                  : "Pay within 48 hours to secure it."
                : orderStatus === "PAID" || status === "PAID"
                  ? "Payment received. Thank you!"
                  : `Order ${orderStatus.toLowerCase()}.`}
            </p>
            {orderStatus === "PENDING" && status !== "PAID" && (
              <a href={`/pay/${props.wonOrderId}`} className={cn(buttonVariants(), "w-fit")} data-testid="pay-now">
                Pay now
              </a>
            )}
          </>
        )}
      </div>
    );
  }
  if (status === "UNSOLD") {
    return (
      <div className="rounded-xl border p-4" data-testid="outcome">
        <div className="font-medium">This auction ended without a sale.</div>
      </div>
    );
  }
  if (status === "CANCELLED") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="outcome">
        <div className="font-medium">This auction was cancelled.</div>
      </div>
    );
  }
  return null;
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
  const placeholder = useMemo(() => (props.minNext / 100).toFixed(2), [props.minNext]);

  if (!props.viewer.signedIn) {
    return (
      <div className="rounded-xl border p-4 text-sm">
        <Link href={`/sign-in?next=/auctions/${props.auctionId}`} className="font-medium underline">Sign in</Link> to place a bid.
      </div>
    );
  }
  if (!props.viewer.canBid) {
    return <div className="rounded-xl border p-4 text-sm text-muted-foreground">{props.viewer.reason}</div>;
  }

  function submit(amountCents: number | null) {
    if (amountCents == null || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await placeBidAction(props.auctionId, amountCents);
      if (res.ok) {
        props.onPlaced(res.bid.amountCents);
        setValue("");
        toast.success(`Bid placed: ${formatCents(res.bid.amountCents)}`);
        return;
      }
      if (res.code === "TOO_LOW" && res.minCents) {
        setError(`Too low. The minimum bid is now ${formatCents(res.minCents)}.`);
        setValue((res.minCents / 100).toFixed(2));
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form
      className="grid gap-2 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value.trim() === "" ? props.minNext : parseDollars(value));
      }}
    >
      <Label htmlFor="bid-amount">Your bid (min {formatCents(props.minNext)})</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            id="bid-amount"
            name="amount"
            inputMode="decimal"
            className="pl-6"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "bid-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={pending || props.iAmHigh}>
          {pending ? "Bidding…" : "Place bid"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 4].map((steps) => {
          const amt = props.minNext + steps * props.increment;
          return (
            <Button key={steps} type="button" variant="outline" size="sm" disabled={pending || props.iAmHigh} onClick={() => submit(amt)}>
              Bid {formatCents(amt)}
            </Button>
          );
        })}
      </div>
      {props.iAmHigh && <p className="text-sm text-muted-foreground">You&apos;re winning. We&apos;ll let you know if someone outbids you.</p>}
      {error && (
        <p id="bid-error" role="alert" className="text-sm text-destructive" data-testid="bid-error">
          {error}
        </p>
      )}
    </form>
  );
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${m}:${pad(sec)}`;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
