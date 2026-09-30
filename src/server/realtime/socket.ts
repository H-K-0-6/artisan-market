import type { Server, Socket } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";
import { rooms } from "@/server/realtime/rooms";
import { getAuctionState } from "@/server/queries/auction-state";

const MAX_AUCTION_ROOMS = 20;
const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{10,40}$/i.test(v);

export type SocketUser = { id: string; role: string };


export function registerSocketHandlers(io: Server) {
  // Anonymous sockets are allowed (they can watch auctions); signed-in users get
  // socket.data.user and join their private room.
  io.use(async (socket, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.request.headers),
      });
      if (session && !session.user.banned) {
        socket.data.user = { id: session.user.id, role: session.user.role ?? "buyer" } satisfies SocketUser;
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser | undefined;
    if (user) {
      socket.join(rooms.user(user.id));
      if (user.role === "admin") socket.join(rooms.admin);
    }

    // Watching an auction: anyone (even anonymous) may join its room. Bids never
    // travel over the socket; they go through POST /api/auctions/[id]/bids or the
    // server action. Clients re-emit auction:join after every (re)connect and get a
    // fresh auction:state (with serverNow) each time.
    socket.on("auction:join", async (auctionId: unknown, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!isId(auctionId)) return reply({ ok: false, error: "Invalid auction" });
      const joined = [...socket.rooms].filter((r) => r.startsWith("auction:"));
      if (!socket.rooms.has(rooms.auction(auctionId)) && joined.length >= MAX_AUCTION_ROOMS) {
        return reply({ ok: false, error: "Too many auctions open" });
      }
      try {
        const state = await getAuctionState(auctionId);
        if (!state) return reply({ ok: false, error: "Auction not found" });
        await socket.join(rooms.auction(auctionId));
        socket.emit("auction:state", state);
        reply({ ok: true });
      } catch (err) {
        console.error("[socket] auction:join failed", err);
        reply({ ok: false, error: "Could not join" });
      }
    });

    socket.on("auction:leave", (auctionId: unknown) => {
      if (isId(auctionId)) void socket.leave(rooms.auction(auctionId));
    });

    socket.on("ping", (cb?: (reply: { pong: true; serverNow: number }) => void) => {
      cb?.({ pong: true, serverNow: Date.now() });
    });
  });
}
