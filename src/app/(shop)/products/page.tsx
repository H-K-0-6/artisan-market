import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { listCategories, parseCatalogParams, searchProducts, SORTS } from "@/server/queries/catalog";
import { ProductCard } from "@/components/shop/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata = { title: "Shop" };

const selectClass =
  "h-11 rounded-full border border-input bg-card px-4 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const [{ products, total, pageCount }, categories] = await Promise.all([searchProducts(params), listCategories()]);
  const topLevel = categories.filter((c) => !c.parentId);
  const active = categories.find((c) => c.slug === params.category);

  const href = (over: { category?: string | null; page?: number; q?: string | null; sort?: string | null }) => {
    const sp = new URLSearchParams();
    const q = over.q === undefined ? params.q : over.q;
    if (q) sp.set("q", q);
    const category = over.category === undefined ? params.category : over.category;
    if (category) sp.set("category", category);
    const sort = over.sort === undefined ? params.sort : over.sort;
    if (sort && sort !== "newest") sp.set("sort", sort);
    if (over.page && over.page > 1) sp.set("page", String(over.page));
    const s = sp.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <div className="grid gap-10">
      <header className="grid gap-3">
        <h1 className="display text-5xl sm:text-6xl">{active ? active.name : "The shop"}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          {params.q
            ? `${total} ${total === 1 ? "piece matches" : "pieces match"} “${params.q}”.`
            : `${total} handmade ${total === 1 ? "piece" : "pieces"}, each listed by the person who made it.`}
        </p>
      </header>

      <div className="grid gap-4">
        <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ name: "Everything", slug: null as string | null }, ...topLevel].map((c) => {
            const isActive = (c.slug ?? undefined) === params.category;
            return (
              <Link
                key={c.name}
                href={href({ category: c.slug, page: 1 })}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                  isActive ? "border-indigo bg-indigo text-white dark:text-indigo-deep" : "bg-card hover:border-indigo/40 hover:text-indigo",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>

        <form method="GET" action="/products" className="flex flex-wrap items-center gap-2">
          {params.category && <input type="hidden" name="category" value={params.category} />}
          <div className="relative w-full sm:w-80">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={params.q}
              placeholder="Search mugs, scarves, spoons…"
              className="h-11 rounded-full bg-card pl-10"
              aria-label="Search the shop"
            />
          </div>
          <select name="sort" defaultValue={params.sort} className={selectClass} aria-label="Sort by">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="lg" className="rounded-full">
            Search
          </Button>
          {(params.q || params.sort !== "newest") && (
            <Link href={href({ page: 1, q: null, sort: null })} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Clear search
            </Link>
          )}
        </form>
      </div>

      {products.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-[1.5rem] border border-dashed p-10">
          <h2 className="display text-3xl">Nothing matches that yet</h2>
          <p className="max-w-md text-muted-foreground">Try a broader word, or browse everything the makers have listed.</p>
          <Link href="/products" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Browse everything
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 4} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pages">
          {params.page > 1 ? (
            <Link href={href({ page: params.page - 1 })} className={buttonVariants({ variant: "outline" })}>
              Previous page
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", className: "pointer-events-none opacity-40" })}>Previous page</span>
          )}
          <span className="numeric text-sm text-muted-foreground">
            Page {Math.min(params.page, pageCount)} of {pageCount}
          </span>
          {params.page < pageCount ? (
            <Link href={href({ page: params.page + 1 })} className={buttonVariants({ variant: "outline" })}>
              Next page
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", className: "pointer-events-none opacity-40" })}>Next page</span>
          )}
        </nav>
      )}
    </div>
  );
}
