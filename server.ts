import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "@/lib/io";
import { registerSocketHandlers } from "@/server/realtime/socket";
import { startJobs, stopJobs } from "@/server/jobs/register";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";

async function main() {
  const app = next({ dev, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, { path: "/socket.io" });
  setIO(io);
  registerSocketHandlers(io);
  await startJobs();

  const shutdown = async () => {
    await stopJobs().catch((err) => console.error(err));
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
