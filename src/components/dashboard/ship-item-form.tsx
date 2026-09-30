"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markShipped } from "@/server/actions/order";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShipItemForm({ orderItemId }: { orderItemId: string }) {
  const [trackingNo, setTrackingNo] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await markShipped(orderItemId, trackingNo);
          if (res?.error) toast.error(res.error);
          else toast.success(res?.orderShipped ? "Order shipped; the buyer has been notified" : "Item marked shipped");
        });
      }}
    >
      <Input
        value={trackingNo}
        onChange={(e) => setTrackingNo(e.target.value)}
        placeholder="Tracking number"
        aria-label="Tracking number"
        className="w-40"
        required
        minLength={3}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Mark shipped"}
      </Button>
    </form>
  );
}
