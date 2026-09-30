import type { Server, Socket } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";

export type SocketUser = { id: string; role: string };

export const rooms = {
  auction: (id: string) => `auction:${id}`,
  user: (id: string) => `user:${id}`,
  admin: "admin",
} as const;

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

    socket.on("ping", (cb?: (reply: { pong: true; serverNow: number }) => void) => {
      cb?.({ pong: true, serverNow: Date.now() });
    });
  });
}
