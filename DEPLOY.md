# Deploying to Fly.io

The app is one long-lived Node process (`server.ts`) that runs Next.js, the
Socket.IO server for live bidding, and the pg-boss jobs that start and close
auctions on time. On Fly that means **exactly one machine that never sleeps**,
plus a Postgres database.

## 1. One-time setup

```sh
fly auth login
fly launch --no-deploy --copy-config      # keeps fly.toml; pick a unique app name if asked
```

If the name `artisan-market` is taken, change `app` in `fly.toml`. Keep
`primary_region` in the same region as the database.

### Database

Create a Postgres 15+ database in the same region, either Fly Managed Postgres
(`fly mpg create`; see `fly mpg --help`) or an external one such as Neon. Then set
its connection string as a secret:

```sh
fly secrets set DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

pg-boss creates its own `pgboss` schema on first start; the database user needs
permission to create schemas (the default owner role does).

### Secrets

```sh
fly secrets set \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL="https://<your-app>.fly.dev" \
  APP_URL="https://<your-app>.fly.dev" \
  STRIPE_SECRET_KEY="sk_live_or_test_..." \
  UPLOADTHING_TOKEN="..."
```

### Stripe webhook

In the Stripe Dashboard → Developers → Webhooks, add an endpoint
`https://<your-app>.fly.dev/api/webhooks/stripe` with these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`

Then set its signing secret:

```sh
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
```

## 2. Deploy

```sh
fly deploy --ha=false
fly scale count 1          # Socket.IO rooms and timers live in one process
```

`release_command` runs `prisma migrate deploy` before the new version takes
traffic. Check it's healthy:

```sh
curl https://<your-app>.fly.dev/api/health   # {"ok":true,"db":true,"jobs":true}
fly logs
```

## 3. First admin

Sign up through the site, then promote that account:

```sh
fly ssh console -C "node_modules/.bin/tsx scripts/make-admin.ts you@example.com"
```

Do **not** run `prisma/seed.ts` in production: it creates demo accounts with a
published password.

## Scaling later

More than one machine needs the Socket.IO Redis adapter (`@socket.io/redis-adapter`)
so events reach users on other machines. pg-boss already coordinates jobs across
machines through Postgres.
