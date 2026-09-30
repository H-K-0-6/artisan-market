import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getProductBySlug } from "@/server/queries/catalog";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductGallery } from "@/components/shop/product-gallery";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const product = await getProductBySlug((await params).slug);
  return { title: product?.title ?? "Product not found" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, session] = await Promise.all([getProductBySlug(slug), getSession()]);
  if (!product) notFound();

  const isOwner = session?.user.id === product.artisan.userId;
  const auctionOnly = product.priceCents <= 0;
  const disabledReason = isOwner
    ? "This is your own product."
    : auctionOnly
      ? "This piece is only sold at auction."
      : undefined;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductGallery images={product.images} title={product.title} />

      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          {product.category && (
            <Link href={`/products?category=${product.category.slug}`} className="text-sm text-muted-foreground hover:underline">
              {product.category.name}
            </Link>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
          <Link href={`/shops/${product.artisan.slug}`} className="text-sm underline-offset-4 hover:underline">
            by {product.artisan.shopName}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {!auctionOnly && <span className="text-2xl font-semibold tabular-nums">{formatCents(product.priceCents)}</span>}
          {product.stock > 0 ? (
            <Badge variant="secondary">{product.stock} in stock</Badge>
          ) : (
            <Badge variant="outline">Out of stock</Badge>
          )}
        </div>

        <AddToCart productId={product.id} stock={product.stock} signedIn={Boolean(session)} disabledReason={disabledReason} />

        <div className="grid gap-2">
          <h2 className="font-medium">About this piece</h2>
          <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>
        </div>
      </div>
    </div>
  );
}
