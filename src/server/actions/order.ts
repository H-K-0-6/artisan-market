"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { markItemShipped, OrderError } from "@/server/services/order.service";
import type { FormState } from "@/server/actions/types";

const trackingSchema = z.string().trim().min(3, "Enter a tracking number").max(100);

/** Artisan marks one of their paid order lines as shipped. */
export async function markShipped(orderItemId: string, trackingNo: string): Promise<FormState & { orderShipped?: boolean }> {
  const session = await requireRole("artisan");
  const parsed = trackingSchema.safeParse(trackingNo);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const { orderShipped } = await markItemShipped(session.user.id, orderItemId, parsed.data);
    revalidatePath("/dashboard/orders");
    revalidatePath("/account/orders", "layout");
    return { ok: true, orderShipped };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
}
