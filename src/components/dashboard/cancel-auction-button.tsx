"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelMyAuction } from "@/server/actions/auction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Lets the owning artisan cancel a scheduled auction (before it goes live). */
export function CancelAuctionButton({ auctionId }: { auctionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Cancel auction
      </Button>
    );
  }

  return (
    <form
      className="grid max-w-md gap-2 rounded-lg border border-destructive/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await cancelMyAuction(auctionId, reason);
          if (res?.error) setError(res.error);
          else {
            toast.success("Auction cancelled");
            setOpen(false);
          }
        });
      }}
    >
      <Label htmlFor="cancel-reason">Why are you cancelling?</Label>
      <Input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        minLength={3}
        maxLength={500}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancel"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
