"use client";

import { useTransition } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-9 items-center rounded-full border bg-background">
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={pending || qty <= 1}
          onClick={() => run(() => updateCartItem(itemId, qty - 1))}
          aria-label="Decrease quantity"
        >
          <MinusIcon className="size-3.5" />
        </button>
        <span className="numeric w-7 text-center text-sm font-semibold" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={pending || qty >= max}
          onClick={() => run(() => updateCartItem(itemId, qty + 1))}
          aria-label="Increase quantity"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      {qty > max && max > 0 && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => updateCartItem(itemId, max))}>
          Set to {max}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-madder" disabled={pending} onClick={() => run(() => removeCartItem(itemId))}>
        Remove
      </Button>
    </div>
  );
}
