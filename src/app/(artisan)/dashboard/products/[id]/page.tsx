import { requireRolePage } from "@/lib/rbac";
import { getMyProduct, getMyShop, listCategories } from "@/server/queries/dashboard";
import { ProductForm } from "@/components/dashboard/product-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const [product, categories] = await Promise.all([getMyProduct(shop.id, id), listCategories()]);

  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl">Edit product</h1>
      <ProductForm
        productId={product.id}
        categories={categories}
        initial={{
          title: product.title,
          description: product.description,
          priceCents: product.priceCents,
          stock: product.stock,
          categoryId: product.categoryId,
          status: product.status === "ARCHIVED" ? "DRAFT" : product.status,
          images: product.images.map((i) => ({ key: i.key, url: i.url })),
        }}
      />
    </div>
  );
}
