import { requireRolePage } from "@/lib/rbac";
import { getMyShop, listCategories } from "@/server/queries/dashboard";
import { ProductForm } from "@/components/dashboard/product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const session = await requireRolePage("artisan");
  await getMyShop(session.user.id);
  const categories = await listCategories();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductForm productId={null} categories={categories} />
    </div>
  );
}
