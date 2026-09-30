"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AuthError, requireRole } from "@/lib/rbac";
import { ROLES } from "@/lib/permissions";
import * as admin from "@/server/services/admin.service";

export type AdminActionResult = { ok: true; message?: string } | { ok: false; error: string };

const id = z.string().trim().min(1).max(64);
const reason = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500);

/** Shared wrapper: admin check, zod parse, user-facing errors, cache refresh. */
async function run<S extends z.ZodType>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>, actorId: string) => Promise<string | void>,
): Promise<AdminActionResult> {
  try {
    const session = await requireRole("admin");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const message = await fn(parsed.data, session.user.id);
    // Moderation affects the storefront, dashboards and every admin page.
    revalidatePath("/", "layout");
    return { ok: true, message: message ?? undefined };
  } catch (err) {
    if (err instanceof admin.AdminActionError) return { ok: false, error: err.message };
    if (err instanceof AuthError) return { ok: false, error: "Not allowed" };
    console.error("admin action failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function hideProductAction(input: { productId: string; reason: string }) {
  return run(z.object({ productId: id, reason }), input, async (d, actorId) => {
    await admin.hideProduct({ actorId, ...d });
    return "Product hidden";
  });
}

export async function restoreProductAction(input: { productId: string }) {
  return run(z.object({ productId: id }), input, async (d, actorId) => {
    await admin.restoreProduct({ actorId, ...d });
    return "Product restored";
  });
}

export async function banUserAction(input: { userId: string; reason: string; hideProducts: boolean }) {
  return run(z.object({ userId: id, reason, hideProducts: z.boolean() }), input, async (d, actorId) => {
    const h = await headers();
    const { hiddenProducts } = await admin.banUser(
      { actorId, ...d },
      { banInAuth: (userId, banReason) => auth.api.banUser({ body: { userId, banReason }, headers: h }) },
    );
    return hiddenProducts ? `User banned and ${hiddenProducts} products hidden` : "User banned";
  });
}

export async function unbanUserAction(input: { userId: string }) {
  return run(z.object({ userId: id }), input, async (d, actorId) => {
    const h = await headers();
    await admin.unbanUser({ actorId, ...d }, { unbanInAuth: (userId) => auth.api.unbanUser({ body: { userId }, headers: h }) });
    return "User unbanned";
  });
}

export async function setUserRoleAction(input: { userId: string; role: string }) {
  return run(z.object({ userId: id, role: z.enum(ROLES) }), input, async (d, actorId) => {
    const h = await headers();
    await admin.setUserRole(
      { actorId, ...d },
      { setRoleInAuth: (userId, role) => auth.api.setRole({ body: { userId, role }, headers: h }) },
    );
    return `Role changed to ${d.role}`;
  });
}

export async function cancelAuctionAction(input: { auctionId: string; reason: string }) {
  return run(z.object({ auctionId: id, reason }), input, async (d, actorId) => {
    await admin.cancelAuctionAsAdmin({ actorId, ...d });
    return "Auction cancelled";
  });
}
