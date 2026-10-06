"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelCartOrder } from "@/server/actions/checkout";
import { Button, buttonVariants } from "@/components/ui/button";

export function PendingOrderActions({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/pay/${orderId}`} className={buttonVariants()}>
        Continue to payment
      </Link>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this order? The items go back into your cart.")) return;
          startTransition(async () => {
            const res = await cancelCartOrder(orderId);
            if (res?.error) toast.error(res.error);
            else toast.success("Order cancelled");
          });
        }}
      >
        Cancel order
      </Button>
    </div>
  );
}
