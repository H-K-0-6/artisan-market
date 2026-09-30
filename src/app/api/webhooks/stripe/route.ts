import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/server/services/order.service";

// Stripe calls this directly, so it must stay outside src/proxy.ts's matcher.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return new Response("Missing signature", { status: 400 });

  // The signature covers the exact raw bytes, so read the body as text.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    console.warn("[stripe] webhook signature verification failed", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, ...result });
  } catch (e) {
    // Non-2xx makes Stripe retry; nothing was committed because it's one transaction.
    console.error(`[stripe] handling ${event.type} ${event.id} failed`, e);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
