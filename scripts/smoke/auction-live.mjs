// End-to-end check of the live auction flow against a running server:
// scheduled start (sweep/job), two bidders on sockets, outbid + anti-snipe events,
// automatic close, winner order and the /pay redirect to Stripe Checkout.
// Usage: node scripts/smoke/auction-live.mjs   (server on PORT, default 3000)
import "dotenv/config";
import pg from "pg";
import { io } from "socket.io-client";

const B = `http://localhost:${process.env.PORT ?? 3000}`;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

async function login(email) {
  const r = await fetch(`${B}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  if (r.status !== 200) fail(`login ${email} -> ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// --- 1. a SCHEDULED auction starting in ~3s, ending ~60s later (DB clock, as UTC like Prisma stores it) ---
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows: [shop] } = await db.query(
  `SELECT s.id FROM "ArtisanProfile" s JOIN "user" u ON u.id = s."userId" WHERE u.email = 'artisan@demo.test'`,
);
const suffix = Date.now().toString(36);
const productId = `e2ep${suffix}`;
const auctionId = `e2ea${suffix}`;
await db.query(
  `INSERT INTO "Product" (id, "artisanId", title, slug, description, "priceCents", stock, status, "updatedAt")
   VALUES ($1, $2, $3, $4, 'E2E auction lot', 0, 1, 'ACTIVE', (now() AT TIME ZONE 'UTC'))`,
  [productId, shop.id, `E2E Lot ${suffix}`, `e2e-lot-${suffix}`],
);
await db.query(
  `INSERT INTO "Auction" (id, "productId", "artisanId", status, "startPriceCents", "minIncrementCents",
     "startsAt", "endsAt", "originalEndsAt", "updatedAt")
   VALUES ($1, $2, $3, 'SCHEDULED', 5000, 500, (now() AT TIME ZONE 'UTC') + interval '3 seconds',
     (now() AT TIME ZONE 'UTC') + interval '60 seconds', (now() AT TIME ZONE 'UTC') + interval '60 seconds', (now() AT TIME ZONE 'UTC'))`,
  [auctionId, productId, shop.id],
);
log("created scheduled auction", auctionId);

// --- 2. two buyers connect and join the room ---
const cookies = { buyer: await login("buyer@demo.test"), buyer2: await login("buyer2@demo.test") };
const events = { buyer: [], buyer2: [] };
const sockets = {};
for (const who of ["buyer", "buyer2"]) {
  const s = io(B, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie: cookies[who] } });
  sockets[who] = s;
  s.onAny((event, payload) => events[who].push({ event, payload, at: Date.now() }));
  await new Promise((res, rej) => {
    s.on("connect", res);
    s.on("connect_error", rej);
  });
  const ack = await s.timeout(5000).emitWithAck("auction:join", auctionId);
  if (!ack?.ok) fail(`${who} join failed: ${JSON.stringify(ack)}`);
}
log("both buyers joined; initial state:", events.buyer.find((e) => e.event === "auction:state")?.payload.status);

const waitFor = (who, event, pred = () => true, ms = 60_000) =>
  new Promise((res, rej) => {
    const found = () => events[who].find((e) => e.event === event && pred(e.payload));
    const hit = found();
    if (hit) return res(hit);
    const timer = setTimeout(() => rej(new Error(`timeout waiting for ${who} ${event}`)), ms);
    const iv = setInterval(() => {
      const h = found();
      if (h) {
        clearInterval(iv);
        clearTimeout(timer);
        res(h);
      }
    }, 50);
  });

async function bid(who, amountCents) {
  const sent = Date.now();
  const r = await fetch(`${B}/api/auctions/${auctionId}/bids`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies[who], origin: B },
    body: JSON.stringify({ amountCents }),
  });
  return { status: r.status, body: await r.json(), sent };
}

// --- 3. starts automatically ---
await waitFor("buyer2", "auction:started", (p) => p.auctionId === auctionId, 60_000).catch((e) => fail(e.message));
log("auction:started received");

// --- 4. bidding ---
const tooLow = await bid("buyer", 4000);
log("too-low bid ->", tooLow.status, tooLow.body.code);
if (tooLow.status !== 422) fail("expected 422 for a bid below the start price");

const b1 = await bid("buyer", 5000);
if (b1.status !== 201) fail(`buyer first bid -> ${b1.status} ${JSON.stringify(b1.body)}`);
const seen1 = await waitFor("buyer2", "bid:placed", (p) => p.amountCents === 5000);
log(`buyer bid $50.00 -> 201; buyer2 saw bid:placed after ${seen1.at - b1.sent}ms as "${seen1.payload.bidderAlias}"`);

const b2 = await bid("buyer2", 5500);
if (b2.status !== 201) fail(`buyer2 bid -> ${b2.status} ${JSON.stringify(b2.body)}`);
const seen2 = await waitFor("buyer", "bid:placed", (p) => p.amountCents === 5500);
const outbid = await waitFor("buyer", "bid:outbid", (p) => p.auctionId === auctionId);
const extended = await waitFor("buyer", "auction:extended", (p) => p.auctionId === auctionId);
log(`buyer2 bid $55.00 -> 201; buyer saw it after ${seen2.at - b2.sent}ms, got bid:outbid ($${outbid.payload.amountCents / 100}) and auction:extended to ${extended.payload.endsAt}`);

const repeat = await bid("buyer2", 6000);
log("high bidder bidding again ->", repeat.status, repeat.body.code);

const b3 = await bid("buyer", 6000);
if (b3.status !== 201) fail(`buyer winning bid -> ${b3.status} ${JSON.stringify(b3.body)}`);
await waitFor("buyer2", "bid:outbid", (p) => p.auctionId === auctionId);
const { rows: [cur] } = await db.query(`SELECT "endsAt", "bidCount", "currentPriceCents" FROM "Auction" WHERE id = $1`, [auctionId]);
log(`buyer bid $60.00 -> 201; buyer2 outbid. DB: price=${cur.currentPriceCents} bids=${cur.bidCount} `);

// --- 5. closes by itself (end job re-queued after anti-snipe, or the 30s sweep) ---
log("waiting for the server to close the auction...");
const ended = await waitFor("buyer2", "auction:ended", (p) => p.auctionId === auctionId, 240_000).catch((e) => fail(e.message));
// endsAt as the server reported it (node-pg reads timestamp-without-tz columns as local time).
const finalEndsAt = events.buyer2.filter((e) => e.event === "bid:placed").at(-1).payload.endsAt;
const lateBy = ended.at - new Date(finalEndsAt).getTime();
log(`auction:ended ${ended.payload.result} at $${ended.payload.finalPriceCents / 100} (${(lateBy / 1000).toFixed(1)}s after endsAt)`);
const won = await waitFor("buyer", "auction:won", (p) => p.auctionId === auctionId, 10_000).catch((e) => fail(e.message));
log("winner got auction:won with order", won.payload.orderId);

const { rows: [order] } = await db.query(
  `SELECT o.status, o.source, o."totalCents", o."commissionCents", o."payDeadline", a.status AS "auctionStatus", a."winnerId", u.email
   FROM "Order" o JOIN "Auction" a ON a.id = o."auctionId" JOIN "user" u ON u.id = o."buyerId" WHERE o.id = $1`,
  [won.payload.orderId],
);
log("order:", JSON.stringify({ ...order, payDeadline: order.payDeadline.toISOString() }));
const notes = events.buyer.filter((e) => e.event === "notification").map((e) => e.payload.title);
log("buyer notification events:", JSON.stringify(notes));

// --- 6. Pay link ---
const pay = await fetch(`${B}/pay/${won.payload.orderId}`, { headers: { cookie: cookies.buyer }, redirect: "manual" });
const loc = pay.headers.get("location") ?? "";
log("winner GET /pay ->", pay.status, new URL(loc, B).hostname);
const payOther = await fetch(`${B}/pay/${won.payload.orderId}`, { headers: { cookie: cookies.buyer2 }, redirect: "manual" });
log("other buyer GET /pay ->", payOther.status, payOther.headers.get("location"));

for (const s of Object.values(sockets)) s.close();
await db.end();

const ok =
  ended.payload.result === "SOLD" &&
  order.status === "PENDING" &&
  order.email === "buyer@demo.test" &&
  order.totalCents === 6000 &&
  loc.includes("checkout.stripe.com") &&
  (payOther.headers.get("location") ?? "").includes("not-found") &&
  repeat.status === 409;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
