"use client";

import { useEffect, useState } from "react";
import { getSocket, useSocketConnected } from "@/lib/socket-client";
import type { ServerEvents } from "@/server/realtime/emit";

export type LotStatus = "SCHEDULED" | "LIVE" | "ENDED" | "PAID" | "UNSOLD" | "CANCELLED";

export type LotSnapshot = {
  status: LotStatus;
  currentPriceCents: number | null;
  minNextBidCents: number;
  bidCount: number;
  reserveMet: boolean;
  startsAt: string;
  endsAt: string;
  serverNow: number;
};

export type LotResult = { kind: "SOLD" | "UNSOLD" | "CANCELLED"; price: number | null };

/**
 * Live state of one auction lot: joins its socket room (re-joining on reconnect),
 * applies server events, and ticks a countdown on the server's clock. The server
 * alone decides when a lot ends; the countdown is only for display.
 */
export function useLiveLot(
  auctionId: string,
  initial: LotSnapshot,
  handlers: {
    onBid?: (p: ServerEvents["bid:placed"]) => void;
    onStarted?: () => void;
    onExtended?: () => void;
    onWon?: (p: ServerEvents["auction:won"]) => void;
  } = {},
) {
  const connected = useSocketConnected();
  const [status, setStatus] = useState<LotStatus>(initial.status);
  const [price, setPrice] = useState(initial.currentPriceCents);
  const [minNext, setMinNext] = useState(initial.minNextBidCents);
  const [bidCount, setBidCount] = useState(initial.bidCount);
  const [reserveMet, setReserveMet] = useState(initial.reserveMet);
  const [startsAt, setStartsAt] = useState(Date.parse(initial.startsAt));
  const [endsAt, setEndsAt] = useState(Date.parse(initial.endsAt));
  // Server clock minus local clock (ms), refreshed from every event's serverNow.
  const [offset, setOffset] = useState(() => initial.serverNow - Date.now());
  const [result, setResult] = useState<LotResult | null>(null);
  const [extended, setExtended] = useState(false);
  // null until mounted, so the server render never prints a clock hydration would contradict.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const { onBid, onStarted, onExtended, onWon } = handlers;
  useEffect(() => {
    const s = getSocket();
    const sync = (serverNow: number) => setOffset(serverNow - Date.now());
    const mine = <T extends { auctionId: string }>(fn: (p: T) => void) => (p: T) => {
      if (p.auctionId === auctionId) fn(p);
    };

    const join = () => s.emit("auction:join", auctionId);
    const onStateEv = mine((p: ServerEvents["auction:state"]) => {
      sync(p.serverNow);
      setStatus(p.status as LotStatus);
      setPrice(p.currentPriceCents);
      setMinNext(p.minNextBidCents);
      setBidCount(p.bidCount);
      setReserveMet(p.reserveMet);
      setEndsAt(Date.parse(p.endsAt));
      if (p.startsAt) setStartsAt(Date.parse(p.startsAt));
    });
    const onStartedEv = mine((p: ServerEvents["auction:started"]) => {
      sync(p.serverNow);
      setStatus("LIVE");
      setEndsAt(Date.parse(p.endsAt));
      onStarted?.();
    });
    const onBidEv = mine((p: ServerEvents["bid:placed"]) => {
      sync(p.serverNow);
      // Events can arrive out of order: only ever move forward.
      setPrice((prev) => (prev == null || p.amountCents > prev ? p.amountCents : prev));
      setMinNext((prev) => Math.max(prev, p.minNextBidCents));
      setBidCount((prev) => Math.max(prev, p.bidCount));
      setReserveMet((prev) => prev || p.reserveMet);
      setEndsAt((prev) => Math.max(prev, Date.parse(p.endsAt)));
      onBid?.(p);
    });
    const onExtendedEv = mine((p: ServerEvents["auction:extended"]) => {
      sync(p.serverNow);
      setEndsAt((prev) => Math.max(prev, Date.parse(p.endsAt)));
      setExtended(true);
      setTimeout(() => setExtended(false), 2500);
      onExtended?.();
    });
    const onEndedEv = mine((p: ServerEvents["auction:ended"]) => {
      setStatus(p.result === "SOLD" ? "ENDED" : p.result === "UNSOLD" ? "UNSOLD" : "CANCELLED");
      setResult({ kind: p.result, price: p.finalPriceCents });
    });
    const onWonEv = mine((p: ServerEvents["auction:won"]) => onWon?.(p));

    s.on("connect", join);
    s.on("auction:state", onStateEv);
    s.on("auction:started", onStartedEv);
    s.on("bid:placed", onBidEv);
    s.on("auction:extended", onExtendedEv);
    s.on("auction:ended", onEndedEv);
    s.on("auction:won", onWonEv);
    if (s.connected) join();

    return () => {
      s.emit("auction:leave", auctionId);
      s.off("connect", join);
      s.off("auction:state", onStateEv);
      s.off("auction:started", onStartedEv);
      s.off("bid:placed", onBidEv);
      s.off("auction:extended", onExtendedEv);
      s.off("auction:ended", onEndedEv);
      s.off("auction:won", onWonEv);
    };
  }, [auctionId, onBid, onStarted, onExtended, onWon]);

  const serverNow = now == null ? null : now + offset;
  const hasBids = price != null && bidCount > 0;
  return {
    connected,
    status,
    price,
    displayPrice: hasBids ? price! : minNext,
    hasBids,
    minNext,
    bidCount,
    reserveMet,
    startsAt,
    endsAt,
    serverNow,
    result,
    extended,
    msLeft: serverNow == null ? null : endsAt - serverNow,
    msToStart: serverNow == null ? null : startsAt - serverNow,
  };
}
