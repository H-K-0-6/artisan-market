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
  priority?: boolean;
};

export function ProductCard({ product: p, priority }: Props) {
  const soldOut = p.stock === 0;
  const fewLeft = !soldOut && p.stock <= 3;
  return (
    <Link href={`/products/${p.slug}`} className="group grid content-start gap-3 rounded-2xl focus-visible:outline-offset-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-indigo-soft">
        {p.images[0] && (
          <Image
            src={p.images[0].url}
            alt={p.title}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            Sold out
          </span>
        )}
        {fewLeft && (
          <span className="absolute left-3 top-3 rounded-full bg-saffron-soft px-2.5 py-1 text-xs font-semibold text-saffron-ink">
            {p.stock === 1 ? "Last one" : `${p.stock} left`}
          </span>
        )}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-sans text-[0.95rem] font-semibold leading-snug tracking-normal group-hover:text-indigo">{p.title}</h3>
          <span className="numeric shrink-0 text-[0.95rem] font-semibold">{formatCents(p.priceCents)}</span>
        </div>
        {p.artisan && <p className="text-sm text-muted-foreground">{p.artisan.shopName}</p>}
      </div>
    </Link>
  );
}
