import "server-only";
import Stripe from "stripe";

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

function getStripe(): Stripe {
  if (!globalForStripe.stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    globalForStripe.stripe = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      appInfo: { name: "artisan-market" },
    });
  }
  return globalForStripe.stripe;
}

// Created on first use rather than at import, so `next build` (which imports route
// modules) works without secrets, e.g. inside a Docker build.
export const stripe = new Proxy({} as Stripe, {
  get: (_target, prop) => Reflect.get(getStripe(), prop),
});

// Read at runtime (not NEXT_PUBLIC_*, which is baked in at build time) so one image
// can be deployed to any domain.
export const appUrl = (path = "") =>
  `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}${path}`;
