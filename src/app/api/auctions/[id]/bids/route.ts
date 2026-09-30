import { z } from "zod";
import { getSession } from "@/lib/rbac";
import { placeBid, toBidErrorResponse } from "@/server/services/bid.service";

const bodySchema = z.object({ amountCents: z.number().int().positive().max(1_000_000_000) });

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CLOSED: 409,
  ALREADY_HIGH_BIDDER: 409,
  OWN_AUCTION: 403,
  NOT_ALLOWED: 403,
  TOO_LOW: 422,
  INVALID_AMOUNT: 422,
  RATE_LIMITED: 429,
};

/** Places a bid. Body: { amountCents }. Thin wrapper over bid.service.placeBid. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.user.banned) {
    return Response.json({ code: "UNAUTHENTICATED", message: "Sign in to bid" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: "INVALID_AMOUNT", message: "Send { amountCents } as a positive integer" }, { status: 422 });
  }

  try {
    const bid = await placeBid(session.user.id, id, parsed.data.amountCents);
    return Response.json(bid, { status: 201 });
  } catch (err) {
    const body = toBidErrorResponse(err);
    return Response.json(body, { status: STATUS[body.code] ?? 500 });
  }
}
