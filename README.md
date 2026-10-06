# Artisan Market

A marketplace for handcrafted goods with live auctions.

- **Buyers** browse, buy at a fixed price (paying with BENEFIT, BenefitPay or a card through Tap Payments), and bid in live auctions.
- **Artisans** run a shop, list products with photos, schedule auctions, and ship orders.
- **Admins** see everything: users, products, auctions with full bid history, orders, and revenue. They can ban users, hide listings and cancel auctions, and every action is audited.

Stack: Next.js 16 (App Router) with a custom `server.ts` that also hosts Socket.IO and pg-boss; Prisma 7 + PostgreSQL; Better Auth (roles, bans); Tap Payments (BENEFIT, BenefitPay, cards) with webhooks; UploadThing; shadcn/ui on Base UI.

## Run locally

On Windows, double-click **start.bat** (starts the database and the app, then opens the browser) and **stop.bat** to shut everything down cleanly. Or by hand:

```sh
npm install
cp .env.example .env           # fill in Tap test keys (TAP_*) and UPLOADTHING_TOKEN
npm run db                     # local Postgres 17 (embedded, no Docker); leave running
npx prisma migrate deploy && npm run db:seed
npm run dev                    # http://localhost:3000
```

Demo accounts (password `Password123!`): `admin@demo.test`, `artisan@demo.test`, `artisan2@demo.test`, `buyer@demo.test`, `buyer2@demo.test`.

Prices are in Bahraini dinars (BD, 3 decimals), stored as whole fils (1 BD = 1000 fils) in the `*Cents` columns.

### Test payments (Tap sandbox)

| Method | Test details | Result |
| --- | --- | --- |
| BENEFIT | Card `4600 4101 2345 6789`, expiry 12/2027, a letters-only name, PIN `1234` on the on-screen keypad | Paid |
| BENEFIT | Card `1111 1101 2345 6789` | Declined |
| Card | Mastercard `5123 4500 0000 0008` or Visa `4508 7500 1574 1019`, any future expiry, CVV `100` | Paid, after the 3-D Secure test page |
| BenefitPay | Shows a QR code; paying it needs the BenefitPay test app | n/a |

Tap can't reach a webhook on localhost. Instead, when Tap sends the buyer back, the app asks Tap for the charge result itself. Unfinished checkouts are released after 20 minutes: the stock is restored and the items go back in the cart.

## How it fits together

| Concern | Where |
| --- | --- |
| Roles and access | `src/lib/rbac.ts`: `requireRole()` in every action and route, `requireRolePage()` in layouts; `src/proxy.ts` is only an early redirect |
| Bidding | `src/server/services/bid.service.ts`: one transaction that locks the auction row (`FOR UPDATE`) and uses the database clock; anti-sniping extends the end by 2 min |
| Auction lifecycle | `src/server/services/auction-lifecycle.ts` and `src/server/jobs/*`: pg-boss start/end/expiry jobs plus a 30s safety sweep; every step is idempotent |
| Payments | `src/lib/tap.ts` (Tap API and signatures); `src/server/services/payments.ts` (starts payments, applies charge results idempotently, refunds late or mismatched payments, releases unpaid checkouts); `src/app/api/webhooks/tap`; `src/app/(shop)/checkout/return` |
| Live updates | `src/server/realtime/*`: rooms `auction:{id}`, `user:{id}`, `admin`; events are emitted only after commit |

## Tests

```sh
npm test                       # unit
npm run test:int               # integration, against DATABASE_URL_TEST (concurrency, payments, lifecycle)
npm run build && npm run e2e   # Playwright against a production build on its own database (pays on Tap's sandbox)
node scripts/smoke/auction-live.mjs   # full live-auction run against a running server
node scripts/smoke/tap-checkout.mjs out BENEFIT   # walk checkout to Tap's page (COMPLETE=1 to pay)
```

## Deploy

Fly.io: see [DEPLOY.md](DEPLOY.md).
