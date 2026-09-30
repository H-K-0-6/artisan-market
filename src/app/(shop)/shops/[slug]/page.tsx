import Image from "next/image";
import { notFound } from "next/navigation";
import { getShopBySlug } from "@/server/queries/catalog";
import { ProductCard } from "@/components/shop/product-card";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const shop = await getShopBySlug((await params).slug);
  return { title: shop?.shopName ?? "Shop not found" };
}

export default async function ShopPage({ params }: Props) {
  const shop = await getShopBySlug((await params).slug);
  if (!shop) notFound();

  return (
    <div className="grid gap-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-muted">
          {shop.avatarUrl && <Image src={shop.avatarUrl} alt="" fill sizes="80px" className="object-cover" />}
        </div>
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{shop.shopName}</h1>
          {shop.bio ? (
            <p className="max-w-2xl whitespace-pre-line text-muted-foreground">{shop.bio}</p>
          ) : (
            <p className="text-muted-foreground">This maker hasn&apos;t written a bio yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">Products</h2>
        {shop.products.length === 0 ? (
          <p className="text-muted-foreground">No products listed right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {shop.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
