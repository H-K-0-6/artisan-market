import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/money";

type Props = {
  product: {
    slug: string;
    title: string;
    priceCents: number;
    stock: number;
    images: { url: string }[];
    artisan?: { shopName: string };
  };
};

export function ProductCard({ product: p }: Props) {
  return (
    <Link href={`/products/${p.slug}`} className="group grid gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {p.images[0] && (
          <Image
            src={p.images[0].url}
            alt={p.title}
            fill
            sizes="(min-width: 768px) 25vw, 50vw"
            className="object-cover transition group-hover:scale-105"
          />
        )}
        {p.stock === 0 && (
          <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">Sold out</span>
        )}
      </div>
      <div className="text-sm font-medium">{p.title}</div>
      <div className="text-sm text-muted-foreground">
        {formatCents(p.priceCents)}
        {p.artisan && <> · {p.artisan.shopName}</>}
      </div>
    </Link>
  );
}
