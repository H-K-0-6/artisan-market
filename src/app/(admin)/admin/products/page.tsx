import { requireRolePage } from "@/lib/rbac";
import { listProducts, PRODUCT_SORTS } from "@/server/queries/admin";
import { first, parseTableState, pickEnum, toView, type SearchParams } from "@/lib/table-params";
import { ProductsTable } from "@/components/admin/tables/products-table";

export const metadata = { title: "Products · Admin" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRolePage("admin");
  const sp = await searchParams;
  const state = parseTableState(sp, { sortable: PRODUCT_SORTS, defaultSort: "updatedAt" });
  const result = await listProducts({
    ...state,
    status: pickEnum(sp, "status", ["DRAFT", "ACTIVE", "HIDDEN", "ARCHIVED"] as const),
    q: first(sp, "q"),
    artisanId: first(sp, "artisan"),
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="text-sm text-muted-foreground">Hidden products are removed from the store until restored.</p>
      </div>
      <ProductsTable rows={result.rows} view={toView(result, state, sp)} />
    </div>
  );
}
