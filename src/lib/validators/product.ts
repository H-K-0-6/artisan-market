import { z } from "zod";

const imageSchema = z.object({ key: z.string().min(1).max(200), url: z.url() });

/**
 * New images must be hosted by UploadThing with a key that matches the URL, so a
 * client can't attach arbitrary URLs to a product.
 */
export function isTrustedUpload(img: { key: string; url: string }) {
  const { hostname, pathname } = new URL(img.url);
  const trusted = hostname === "utfs.io" || hostname.endsWith(".ufs.sh");
  return trusted && pathname.endsWith(`/${img.key}`);
}

export const productSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(120),
  description: z.string().trim().min(10, "Add a few more words").max(5000),
  priceCents: z.number().int().min(100, "Minimum price is $1.00").max(10_000_000),
  stock: z.number().int().min(0).max(10_000),
  categoryId: z.string().nullable(),
  status: z.enum(["DRAFT", "ACTIVE"]),
  images: z.array(imageSchema).max(8, "Up to 8 photos"),
});

export type ProductInput = z.infer<typeof productSchema>;
