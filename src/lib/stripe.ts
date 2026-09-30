import "server-only";
import Stripe from "stripe";

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export const stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-08-26.dahlia",
    appInfo: { name: "artisan-market" },
  });
globalForStripe.stripe = stripe;

export const appUrl = (path = "") =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${path}`;
