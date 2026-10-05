import { requireRolePage } from "@/lib/rbac";
import { getMyShop, listCategories } from "@/server/queries/dashboard";
import { listAuctionableProducts } from "@/server/queries/auctions";
import { AuctionForm } from "@/components/dashboard/auction-form";

export const metadata = { title: "New auction" };

export default async function NewAuctionPage() {
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const [products, categories] = await Promise.all([listAuctionableProducts(shop.id), listCategories()]);
  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl">New auction</h1>
      <AuctionForm products={products} categories={categories} />
    </div>
  );
}
