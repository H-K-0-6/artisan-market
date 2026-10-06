import { retrieveCharge, verifyChargeWebhook, type TapCharge } from "@/lib/tap";
import { applyCharge } from "@/server/services/payments";

/**
 * Tap posts charge results here (the `post.url` of every charge). We check the
 * `hashstring` signature, then re-fetch the charge from Tap's API and apply that
 * copy, so nothing in the request body is trusted on its own.
 */
export async function POST(req: Request) {
  let body: TapCharge;
  try {
    body = (await req.json()) as TapCharge;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body?.object && body.object !== "charge") return Response.json({ received: true, ignored: body.object });
  if (!body?.id || !verifyChargeWebhook(body, req.headers.get("hashstring"))) {
    console.warn("[tap] webhook signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const charge = await retrieveCharge(body.id);
    const result = await applyCharge(charge);
    return Response.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // 500 makes Tap retry the delivery.
    console.error(`[tap] handling webhook for ${body.id} failed`, err);
    return Response.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
