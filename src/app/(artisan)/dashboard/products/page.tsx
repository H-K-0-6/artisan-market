import Image from "next/image";
import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { getMyShop, listMyProducts } from "@/server/queries/dashboard";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteProductButton } from "@/components/dashboard/delete-product-button";

export const metadata = { title: "Products" };

const STATUS_LABEL = { ACTIVE: "Listed", DRAFT: "Draft", HIDDEN: "Hidden by admin", ARCHIVED: "Archived" } as const;

export default async function MyProductsPage() {
  const session = await requireRolePage("artisan");
  const shop = await getMyShop(session.user.id);
  const products = await listMyProducts(shop.id);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-4xl">Products</h1>
        <Link href="/dashboard/products/new" className={buttonVariants()}>New product</Link>
      </div>
      {products.length === 0 ? (
        <p className="text-muted-foreground">No products yet. Create your first listing.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14" />
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="relative size-10 overflow-hidden rounded bg-muted">
                    {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/products/${p.id}`} className="hover:underline">{p.title}</Link>
                  {p.category && <div className="text-xs text-muted-foreground">{p.category.name}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === "ACTIVE" ? "default" : p.status === "HIDDEN" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.priceCents ? formatCents(p.priceCents) : "Auction"}</TableCell>
                <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/dashboard/products/${p.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Edit</Link>
                  <DeleteProductButton productId={p.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
