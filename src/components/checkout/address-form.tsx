"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveShippingAddress } from "@/server/actions/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AddressDefaults = { name?: string; phone?: string; building?: string; flat?: string; road?: string; block?: string; area?: string };

export function AddressForm({ orderId, defaults, onSaved }: { orderId: string; defaults: AddressDefaults; onSaved?: () => void }) {
  const [state, action, pending] = useActionState(saveShippingAddress.bind(null, orderId), undefined);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Delivery address saved");
      onSaved?.();
    }
  }, [state, onSaved]);
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  const field = (name: keyof AddressDefaults, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`addr-${name}`}>{label}</Label>
      <Input id={`addr-${name}`} name={name} defaultValue={defaults[name]} className="h-11 bg-card" aria-invalid={err(name) ? true : undefined} {...props} />
      {err(name) && <p className="text-sm font-medium text-madder">{err(name)}</p>}
    </div>
  );

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Recipient name", { autoComplete: "name", required: true })}
        {field("phone", "Mobile number", { autoComplete: "tel", inputMode: "tel", placeholder: "3XXX XXXX", required: true })}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {field("flat", "Flat (optional)")}
        {field("building", "House / building", { required: true })}
        {field("road", "Road", { inputMode: "numeric", required: true })}
        {field("block", "Block", { inputMode: "numeric", required: true })}
      </div>
      {field("area", "Area", { placeholder: "e.g. Juffair, Riffa, Muharraq", required: true })}
      {state?.error && <p className="rounded-lg bg-madder-soft px-3 py-2 text-sm font-medium text-madder">{state.error}</p>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save address"}
        </Button>
      </div>
    </form>
  );
}
