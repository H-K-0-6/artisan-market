"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import type { FormState } from "@/server/actions/types";

const shopSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is too short").max(60),
  bio: z.string().trim().max(1000).optional(),
});

/** Turns a buyer into an artisan by creating their shop profile. */
export async function becomeArtisan(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("buyer", "artisan");
  const parsed = shopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const slug = await uniqueShopSlug(parsed.data.shopName);
  await prisma.$transaction([
    prisma.artisanProfile.upsert({
      where: { userId: session.user.id },
      update: { shopName: parsed.data.shopName, bio: parsed.data.bio },
      create: { userId: session.user.id, shopName: parsed.data.shopName, bio: parsed.data.bio, slug },
    }),
    prisma.user.update({ where: { id: session.user.id }, data: { role: "artisan" } }),
  ]);
  redirect("/dashboard");
}

async function uniqueShopSlug(name: string) {
  const base = slugify(name) || "shop";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.artisanProfile.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}
