import Image from "next/image";
import { notFound } from "next/navigation";
import { getShopBySlug } from "@/server/queries/catalog";
import { ProductCard } from "@/components/shop/product-card";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const shop = await getShopBySlug((await params).slug);
  return { title: shop?.shopName ?? "Shop not found" };
}

const since = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export default async function ShopPage({ params }: Props) {
  const shop = await getShopBySlug((await params).slug);
  if (!shop) notFound();
  const initials = shop.shopName
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="grid gap-14">
      <section className="indigo-cloth -mx-4 grid gap-6 px-6 py-12 text-white sm:mx-0 sm:grid-cols-[auto_1fr] sm:items-center sm:rounded-[2rem] sm:px-12">
        <div className="relative grid size-24 place-items-center overflow-hidden rounded-[1.25rem] bg-saffron text-saffron-ink">
          {shop.avatarUrl ? (
            <Image src={shop.avatarUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <span className="display text-4xl">{initials}</span>
          )}
        </div>
        <div className="grid gap-3">
          <h1 className="display text-5xl text-white sm:text-6xl">{shop.shopName}</h1>
          <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-white/80">
            {shop.bio ?? "This maker hasn't written about their work yet."}
          </p>
          <p className="text-sm text-white/60">
            Selling on Artisan Market since {since.format(shop.createdAt)}. {shop.products.length}{" "}
            {shop.products.length === 1 ? "piece" : "pieces"} available.
          </p>
        </div>
      </section>

      <section className="grid gap-8">
        <h2 className="display text-3xl sm:text-4xl">In the shop</h2>
        {shop.products.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed p-10 text-muted-foreground">
            Nothing is listed right now. Makers restock as pieces come out of the studio.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {shop.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
