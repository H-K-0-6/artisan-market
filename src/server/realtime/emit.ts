import { getIO } from "@/lib/io";
import { rooms } from "@/server/realtime/rooms";

// Server → client events. Emit only AFTER the database transaction that caused
// them has committed. No-ops when Socket.IO isn't running (tests, scripts).

export type ServerEvents = {
  "auction:state": {
    auctionId: string;
    status: string;
    currentPriceCents: number | null;
    minNextBidCents: number;
    endsAt: string;
    bidCount: number;
    reserveMet: boolean;
    serverNow: number;
  };
  "auction:started": { auctionId: string; endsAt: string; serverNow: number };
  "bid:placed": {
    auctionId: string;
    amountCents: number;
    bidderAlias: string;
    minNextBidCents: number;
    endsAt: string;
    bidCount: number;
    reserveMet: boolean;
    serverNow: number;
  };
  "auction:extended": { auctionId: string; endsAt: string; serverNow: number };
  "auction:ended": { auctionId: string; result: "SOLD" | "UNSOLD" | "CANCELLED"; finalPriceCents: number | null };
  "bid:outbid": { auctionId: string; title: string; amountCents: number };
  "auction:won": { auctionId: string; title: string; amountCents: number; orderId: string };
  notification: { id: string; type: string; title: string; body: string; link: string | null; createdAt: string };
  "admin:activity": { kind: string; message: string; at: string };
};

export function emitToAuction<E extends keyof ServerEvents>(auctionId: string, event: E, payload: ServerEvents[E]) {
  getIO()?.to(rooms.auction(auctionId)).emit(event, payload);
}

export function emitToUser<E extends keyof ServerEvents>(userId: string, event: E, payload: ServerEvents[E]) {
  getIO()?.to(rooms.user(userId)).emit(event, payload);
}

export function emitToAdmins(kind: string, message: string) {
  getIO()?.to(rooms.admin).emit("admin:activity", { kind, message, at: new Date().toISOString() });
}

/** Kicks all of a user's sockets (used when they're banned). */
export function disconnectUser(userId: string) {
  getIO()?.in(rooms.user(userId)).disconnectSockets(true);
}
