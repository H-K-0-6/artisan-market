import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { syncOrderPayment } from "@/server/services/payments";

/**
 * GET /checkout/return?order=...&tap_id=chg_...: where Tap sends the buyer after its
 * payment page. We ask Tap for the charge's result directly (webhooks can't reach a
 * local machine, and the buyer shouldn't have to wait for one), then show the outcome.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("order");
  const chargeId = req.nextUrl.searchParams.get("tap_id") ?? undefined;
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  const session = await getSession();
  if (!session) return go(`/sign-in?next=${encodeURIComponent(`/pay/${orderId ?? ""}`)}`);
  if (!orderId) return go("/account/orders");

  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: session.user.id }, select: { id: true } });
  if (!order) return go("/account/orders");

  let chargeStatus: string | null = null;
  try {
    chargeStatus = (await syncOrderPayment(order.id, { chargeId })).chargeStatus;
  } catch (err) {
    console.error(`[tap] could not confirm payment for order ${order.id}`, err);
  }

  const now = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
  if (now.status === "PAID") return go(`/checkout/success?order=${order.id}`);
  if (now.status === "PENDING") {
    // Declined, abandoned or not settled yet: back to the pay page with a reason.
    const reason = chargeStatus && chargeStatus !== "INITIATED" && chargeStatus !== "IN_PROGRESS" ? "declined" : "pending";
    return go(`/pay/${order.id}?payment=${reason}`);
  }
  return go(`/account/orders/${order.id}`);
}
