import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { getMyShop } from "@/server/queries/dashboard";
import { ShopForm } from "./form";

export const metadata = { title: "Shop profile" };

export default async function ShopProfilePage() {
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Shop profile</h1>
        <p className="text-sm text-muted-foreground">
          Public page: <Link href={`/shops/${shop.slug}`} className="underline">/shops/{shop.slug}</Link>
        </p>
      </div>
      <ShopForm shopName={shop.shopName} bio={shop.bio ?? ""} />
    </div>
  );
}
