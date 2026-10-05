import Image from "next/image";
import Link from "next/link";
import { LockIcon } from "lucide-react";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getCartView, type CartLineIssue } from "@/server/queries/orders";
import { CartLineControls } from "@/components/shop/cart-line-controls";
import { CheckoutButton } from "@/components/shop/checkout-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cart" };

function issueText(issue: CartLineIssue, stock: number) {
  switch (issue) {
    case "unavailable":
      return "No longer available. Remove it to check out.";
    case "own":
      return "This is your own piece. Remove it to check out.";
    case "out-of-stock":
      return "Sold out since you added it. Remove it to check out.";
    case "over-stock":
      return `Only ${stock} left. Lower the quantity to check out.`;
    default:
      return null;
  }
}

export default async function CartPage() {
  const session = await requireRolePage();
  const { lines, subtotalCents, hasIssues } = await getCartView(session.user.id);
  const makers = new Set(lines.map((l) => l.product.artisan.shopName));

  if (lines.length === 0) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-4 py-20 text-center">
        <h1 className="display text-5xl">Your cart is empty</h1>
        <p className="text-muted-foreground">Pieces you add will wait here while you keep browsing.</p>
        <Link href="/products" className={buttonVariants({ size: "lg" })}>
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10">
      <header className="grid gap-2">
        <h1 className="display text-5xl">Your cart</h1>
        <p className="text-muted-foreground">
          {lines.length} {lines.length === 1 ? "piece" : "pieces"} from {makers.size} {makers.size === 1 ? "maker" : "makers"}. Each maker
          ships their own pieces.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="grid content-start gap-3">
          {lines.map((line) => {
            const p = line.product;
            const warning = issueText(line.issue, p.stock);
            return (
              <li key={line.id} className={cn("flex gap-5 rounded-[1.25rem] border bg-card p-4", warning && "border-madder/40")}>
                <Link href={`/products/${p.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-indigo-soft sm:size-28">
                  {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="112px" className="object-cover" />}
                </Link>
                <div className="grid flex-1 content-between gap-2">
                  <div className="grid gap-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/products/${p.slug}`} className="font-semibold hover:text-indigo">
                        {p.title}
                      </Link>
                      <span className="numeric font-semibold">{formatCents(line.lineTotalCents)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p.artisan.shopName}, {formatCents(p.priceCents)} each
                    </p>
                    {warning && <p className="text-sm font-medium text-madder">{warning}</p>}
                  </div>
                  <CartLineControls itemId={line.id} qty={line.qty} max={line.issue === "unavailable" || line.issue === "own" ? 0 : p.stock} />
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="grid h-fit gap-5 rounded-[1.5rem] border bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-sans text-lg font-semibold tracking-normal">Order summary</h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-semibold">{formatCents(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>Added at checkout</dd>
            </div>
          </dl>
          <div className="flex items-baseline justify-between border-t pt-4">
            <span className="font-semibold">Total</span>
            <span className="display numeric text-3xl">{formatCents(subtotalCents)}</span>
          </div>
          <CheckoutButton disabled={hasIssues} />
          {hasIssues ? (
            <p className="text-sm font-medium text-madder">Fix the highlighted pieces to check out.</p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <LockIcon className="mt-0.5 size-3.5 shrink-0" />
              You&apos;ll pay on Stripe&apos;s secure page. We hold these pieces for you while you pay.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
