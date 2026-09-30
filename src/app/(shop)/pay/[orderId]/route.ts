import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { createCheckoutSessionForOrder } from "@/server/services/payment.service";

/**
 * GET /pay/[orderId]: the winner's "Pay now" link (also used in AUCTION_WON
 * notifications). Creates a fresh Stripe Checkout Session (capped at payDeadline)
 * and redirects to it. Paid, expired or cancelled orders go back to the account page.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/account/auctions?msg=${msg}`, req.url), 303);

  const session = await getSession();
  if (!session || session.user.banned) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("next", `/pay/${orderId}`);
    return NextResponse.redirect(url, 303);
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: { status: true, payDeadline: true },
  });
  if (!order) return back("not-found");
  if (order.status === "PAID" || order.status === "SHIPPED" || order.status === "DELIVERED") return back("paid");
  if (order.status === "EXPIRED" || (order.status === "PENDING" && order.payDeadline && order.payDeadline <= new Date())) {
    return back("expired");
  }
  if (order.status !== "PENDING") return back("unavailable");

  try {
    const checkout = await createCheckoutSessionForOrder(orderId, session.user.id);
    if (!checkout.url) return back("error");
    return NextResponse.redirect(checkout.url, 303);
  } catch (err) {
    console.error("[pay] could not create checkout session", err);
    return back("error");
  }
}
