import Link from "next/link";
import { listCategories, parseCatalogParams, searchProducts, SORTS } from "@/server/queries/catalog";
import { ProductCard } from "@/components/shop/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Shop" };

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const [{ products, total, pageCount }, categories] = await Promise.all([searchProducts(params), listCategories()]);

  const pageHref = (page: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.category) sp.set("category", params.category);
    if (params.sort !== "newest") sp.set("sort", params.sort);
    if (page > 1) sp.set("page", String(page));
    const s = sp.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Shop</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "item" : "items"}
        </p>
      </div>

      <form method="GET" action="/products" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={params.q} placeholder="Search handmade goods" className="w-full sm:w-64" aria-label="Search" />
        <select name="category" defaultValue={params.category ?? ""} className={selectClass} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.parentId ? `  ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={params.sort} className={selectClass} aria-label="Sort">
          {Object.entries(SORTS).map(([key, s]) => (
            <option key={key} value={key}>{s.label}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Apply</Button>
        {(params.q || params.category || params.sort !== "newest") && (
          <Link href="/products" className={buttonVariants({ variant: "ghost" })}>Clear</Link>
        )}
      </form>

      {products.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No products match your search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
          {params.page > 1 ? (
            <Link href={pageHref(params.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none opacity-50" })}>Previous</span>
          )}
          <span className="text-sm text-muted-foreground">
            Page {Math.min(params.page, pageCount)} of {pageCount}
          </span>
          {params.page < pageCount ? (
            <Link href={pageHref(params.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none opacity-50" })}>Next</span>
          )}
        </nav>
      )}
    </div>
  );
}
