"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { addToCart } from "@/server/actions/cart";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = {
  productId: string;
  stock: number;
  signedIn: boolean;
  /** Why the button is disabled, if it is. */
  disabledReason?: string;
};

export function AddToCart({ productId, stock, signedIn, disabledReason }: Props) {
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!signedIn) {
    return (
      <Link href="/sign-in" className={buttonVariants({ size: "lg", className: "w-full" })}>
        Sign in to buy
      </Link>
    );
  }

  const disabled = Boolean(disabledReason) || stock < 1;
  const clamp = (n: number) => Math.max(1, Math.min(Math.max(1, stock), n));
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 items-center rounded-full border bg-background">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setQty((q) => clamp(q - 1))}
            disabled={disabled || qty <= 1}
            aria-label="One fewer"
          >
            <MinusIcon className="size-4" />
          </button>
          <input
            type="number"
            min={1}
            max={Math.max(1, stock)}
            value={qty}
            onChange={(e) => setQty(clamp(Number(e.target.value) || 1))}
            className="numeric w-10 bg-transparent text-center font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Quantity"
            disabled={disabled}
          />
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setQty((q) => clamp(q + 1))}
            disabled={disabled || qty >= stock}
            aria-label="One more"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
        <Button
          size="lg"
          className="flex-1"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await addToCart(productId, qty);
              if (res?.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
              router.refresh(); // updates the cart count in the header
            })
          }
        >
          {pending ? "Adding…" : stock < 1 ? "Sold out" : "Add to cart"}
        </Button>
      </div>
      {disabledReason && <p className="text-sm text-muted-foreground">{disabledReason}</p>}
    </div>
  );
}
