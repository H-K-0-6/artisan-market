"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addToCart } from "@/server/actions/cart";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <Link href="/sign-in" className={buttonVariants({ size: "lg", className: "w-fit" })}>
        Sign in to buy
      </Link>
    );
  }

  const disabled = Boolean(disabledReason) || stock < 1;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={Math.max(1, stock)}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(stock || 1, Number(e.target.value) || 1)))}
          className="w-20"
          aria-label="Quantity"
          disabled={disabled}
        />
        <Button
          size="lg"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await addToCart(productId, qty);
              if (res?.error) toast.error(res.error);
              else toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
            })
          }
        >
          {pending ? "Adding…" : stock < 1 ? "Out of stock" : "Add to cart"}
        </Button>
      </div>
      {disabledReason && <p className="text-sm text-muted-foreground">{disabledReason}</p>}
    </div>
  );
}
