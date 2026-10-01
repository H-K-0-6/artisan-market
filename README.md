# Artisan Market

A marketplace for handcrafted goods with live auctions.

- **Buyers** browse, buy at a fixed price through Stripe Checkout, and bid in live auctions.
- **Artisans** run a shop, list products with photos, schedule auctions, and ship orders.
- **Admins** see everything: users, products, auctions with full bid history, orders, and revenue. They can ban users, hide listings and cancel auctions, and every action is audited.

Stack: Next.js 16 (App Router) with a custom `server.ts` that also hosts Socket.IO and pg-boss; Prisma 7 + PostgreSQL; Better Auth (roles, bans); Stripe Checkout and webhooks; UploadThing; shadcn/ui on Base UI.

## Run locally

```sh
npm install
cp .env.example .env           # fill in Stripe test keys and UPLOADTHING_TOKEN
npm run db                     # local Postgres 17 (embedded, no Docker); leave running
npx prisma migrate deploy && npm run db:seed
npm run dev                    # http://localhost:3000
npm run stripe:listen          # optional: forward Stripe webhooks (needs the Stripe CLI)
```

Demo accounts (password `Password123!`): `admin@demo.test`, `artisan@demo.test`, `artisan2@demo.test`, `buyer@demo.test`, `buyer2@demo.test`. Test card: `4242 4242 4242 4242`.

## How it fits together

| Concern | Where |
| --- | --- |
| Roles and access | `src/lib/rbac.ts`: `requireRole()` in every action and route, `requireRolePage()` in layouts; `src/proxy.ts` is only an early redirect |
| Bidding | `src/server/services/bid.service.ts`: one transaction that locks the auction row (`FOR UPDATE`) and uses the database clock; anti-sniping extends the end by 2 min |
| Auction lifecycle | `src/server/services/auction-lifecycle.ts` and `src/server/jobs/*`: pg-boss start/end/expiry jobs plus a 30s safety sweep; every step is idempotent |
| Payments | `src/server/services/payment.service.ts` (Checkout Sessions), `order.service.ts` `handleStripeEvent` (idempotent webhook, stock restore, automatic refunds) |
| Live updates | `src/server/realtime/*`: rooms `auction:{id}`, `user:{id}`, `admin`; events are emitted only after commit |

## Tests

```sh
npm test                       # unit
npm run test:int               # integration, against DATABASE_URL_TEST (concurrency, webhooks, lifecycle)
npm run build && npm run e2e   # Playwright against a production build on its own database
node scripts/smoke/auction-live.mjs   # full live-auction run against a running server
```

## Deploy

Fly.io: see [DEPLOY.md](DEPLOY.md).
