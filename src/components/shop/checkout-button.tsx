"use client";

import { useActionState } from "react";
import { checkout } from "@/server/actions/checkout";
import { Button } from "@/components/ui/button";

export function CheckoutButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(checkout, undefined);
  return (
    <form action={action} className="grid gap-2">
      <Button type="submit" size="lg" disabled={disabled || pending}>
        {pending ? "Redirecting to payment…" : "Checkout"}
      </Button>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
    </form>
  );
}
