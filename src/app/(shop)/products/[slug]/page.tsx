import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { buyableProductWhere, getProductBySlug } from "@/server/queries/catalog";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductCard } from "@/components/shop/product-card";
import { SectionHeading } from "@/components/shop/section-heading";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const product = await getProductBySlug((await params).slug);
  return { title: product?.title ?? "Piece not found" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, session] = await Promise.all([getProductBySlug(slug), getSession()]);
  if (!product) notFound();

  const more = await prisma.product.findMany({
    where: { ...buyableProductWhere, artisanId: product.artisan.id, id: { not: product.id } },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });

  const isOwner = session?.user.id === product.artisan.userId;
  const auctionOnly = product.priceCents <= 0;
  const disabledReason = isOwner ? "This is your own piece." : auctionOnly ? "This piece is only sold at auction." : undefined;

  return (
    <div className="grid gap-20">
      <div className="grid gap-6">
        <Link
          href={product.category ? `/products?category=${product.category.slug}` : "/products"}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          {product.category ? product.category.name : "The shop"}
        </Link>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
          <ProductGallery images={product.images} title={product.title} />

          <div className="grid content-start gap-8 lg:sticky lg:top-24 lg:self-start">
            <div className="grid gap-3">
              <h1 className="display text-4xl sm:text-5xl">{product.title}</h1>
              <p className="text-muted-foreground">
                Made by{" "}
                <Link href={`/shops/${product.artisan.slug}`} className="font-semibold text-foreground underline decoration-saffron decoration-2 underline-offset-4">
                  {product.artisan.shopName}
                </Link>
              </p>
            </div>

            <div className="grid gap-5 rounded-[1.5rem] border bg-card p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                {!auctionOnly && <span className="display numeric text-5xl">{formatCents(product.priceCents)}</span>}
                <StockNote stock={product.stock} />
              </div>
              <AddToCart productId={product.id} stock={product.stock} signedIn={Boolean(session)} disabledReason={disabledReason} />
              <p className="text-sm text-muted-foreground">Ships from the maker&apos;s studio. You&apos;ll get a note when it&apos;s on its way.</p>
            </div>

            <section className="grid gap-2">
              <h2 className="font-sans text-base font-semibold tracking-normal">About this piece</h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{product.description}</p>
            </section>

            {product.artisan.bio && (
              <section className="grid gap-2 border-t pt-6">
                <h2 className="font-sans text-base font-semibold tracking-normal">About the maker</h2>
                <p className="leading-relaxed text-muted-foreground">{product.artisan.bio}</p>
                <Link href={`/shops/${product.artisan.slug}`} className="w-fit text-sm font-semibold text-indigo underline decoration-indigo/30 decoration-2 underline-offset-4 hover:decoration-saffron">
                  Visit {product.artisan.shopName}
                </Link>
              </section>
            )}
          </div>
        </div>
      </div>

      {more.length > 0 && (
        <section className="grid gap-8">
          <SectionHeading title={`More from ${product.artisan.shopName}`} href={`/shops/${product.artisan.slug}`} linkLabel="See the whole shop" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
            {more.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StockNote({ stock }: { stock: number }) {
  if (stock < 1) return <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">Sold out</span>;
  if (stock <= 3)
    return (
      <span className="rounded-full bg-saffron-soft px-3 py-1 text-sm font-semibold text-saffron-ink dark:text-saffron">
        {stock === 1 ? "Only one left" : `Only ${stock} left`}
      </span>
    );
  return <span className="rounded-full bg-weld-soft px-3 py-1 text-sm font-semibold text-weld">{stock} in stock</span>;
}
