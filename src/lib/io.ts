import type { Server } from "socket.io";

// server.ts creates the Socket.IO server; Next route handlers and server actions
// run in the same process but a different module graph, so share via globalThis.
const globalForIO = globalThis as unknown as { io?: Server };

export function setIO(io: Server) {
  globalForIO.io = io;
}

export function getIO(): Server | null {
  return globalForIO.io ?? null;
}
