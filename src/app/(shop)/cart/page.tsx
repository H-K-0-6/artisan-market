import Image from "next/image";
import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getCartView, type CartLineIssue } from "@/server/queries/orders";
import { CartLineControls } from "@/components/shop/cart-line-controls";
import { CheckoutButton } from "@/components/shop/checkout-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Cart" };

function issueText(issue: CartLineIssue, stock: number) {
  switch (issue) {
    case "unavailable":
      return "No longer available. Remove it to check out.";
    case "own":
      return "This is your own product. Remove it to check out.";
    case "out-of-stock":
      return "Sold out. Remove it to check out.";
    case "over-stock":
      return `Only ${stock} left. Lower the quantity to check out.`;
    default:
      return null;
  }
}

export default async function CartPage() {
  const session = await requireRolePage();
  const { lines, subtotalCents, hasIssues } = await getCartView(session.user.id);

  if (lines.length === 0) {
    return (
      <div className="grid justify-items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <Link href="/products" className={buttonVariants()}>Browse the shop</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <h1 className="text-2xl font-semibold">Cart</h1>
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => {
            const p = line.product;
            const warning = issueText(line.issue, p.stock);
            return (
              <li key={line.id} className="flex gap-4 p-4">
                <Link href={`/products/${p.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="80px" className="object-cover" />}
                </Link>
                <div className="grid flex-1 gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/products/${p.slug}`} className="font-medium hover:underline">{p.title}</Link>
                    <span className="tabular-nums">{formatCents(line.lineTotalCents)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatCents(p.priceCents)} each · {p.artisan.shopName}
                  </div>
                  {warning && <p className="text-sm text-destructive">{warning}</p>}
                  <CartLineControls itemId={line.id} qty={line.qty} max={line.issue === "unavailable" || line.issue === "own" ? 0 : p.stock} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCents(subtotalCents)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Prices and stock are checked again at checkout. Items are held for you while you pay.
          </p>
          <CheckoutButton disabled={hasIssues} />
          {hasIssues && <p className="text-sm text-destructive">Fix the highlighted items to check out.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
