"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteProduct } from "@/server/actions/product";
import { Button } from "@/components/ui/button";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this product? Products with sales or auctions are archived instead.")) return;
        startTransition(async () => {
          const res = await deleteProduct(productId);
          if (res?.error) toast.error(res.error);
          else toast.success("Product removed");
        });
      }}
    >
      Delete
    </Button>
  );
}
