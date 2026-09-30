"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { removeCartItem, updateCartItem } from "@/server/actions/cart";
import { Button } from "@/components/ui/button";

export function CartLineControls({ itemId, qty, max }: { itemId: string; qty: number; max: number }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
    });

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" disabled={pending || qty <= 1} onClick={() => run(() => updateCartItem(itemId, qty - 1))} aria-label="Decrease quantity">
        −
      </Button>
      <span className="w-8 text-center tabular-nums">{qty}</span>
      <Button variant="outline" size="icon-sm" disabled={pending || qty >= max} onClick={() => run(() => updateCartItem(itemId, qty + 1))} aria-label="Increase quantity">
        +
      </Button>
      {qty > max && max > 0 && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => updateCartItem(itemId, max))}>
          Set to {max}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => run(() => removeCartItem(itemId))}>
        Remove
      </Button>
    </div>
  );
}
