"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressForm, type AddressDefaults } from "@/components/checkout/address-form";
import { PaymentMethods } from "@/components/checkout/payment-methods";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Step 1 (delivery address) then step 2 (payment), which unlocks once an address is saved. */
export function CheckoutSteps(props: {
  orderId: string;
  total: string;
  savedAddress: string[] | null;
  defaults: AddressDefaults;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!props.savedAddress);
  const onSaved = useCallback(() => {
    setEditing(false);
    router.refresh();
  }, [router]);
  const hasAddress = Boolean(props.savedAddress);

  return (
    <ol className="grid gap-6">
      <li className="grid gap-4 rounded-[1.5rem] border bg-card p-6">
        <StepTitle n={1} title="Delivery address" done={hasAddress && !editing} />
        {editing || !props.savedAddress ? (
          <AddressForm orderId={props.orderId} defaults={props.defaults} onSaved={onSaved} />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <address className="not-italic leading-relaxed text-muted-foreground">
              {props.savedAddress.map((line) => (
                <div key={line} className="first:font-semibold first:text-foreground">
                  {line}
                </div>
              ))}
            </address>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Change address
            </Button>
          </div>
        )}
      </li>
      <li className="grid gap-4 rounded-[1.5rem] border bg-card p-6">
        <StepTitle n={2} title="How would you like to pay?" done={false} />
        {!hasAddress && <p className="text-sm text-muted-foreground">Save a delivery address first.</p>}
        <PaymentMethods orderId={props.orderId} total={props.total} disabled={!hasAddress || editing} />
      </li>
    </ol>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="flex items-center gap-3 font-sans text-lg font-semibold tracking-normal">
      <span
        className={cn(
          "numeric grid size-8 place-items-center rounded-full text-sm font-bold",
          done ? "bg-weld text-white dark:text-indigo-deep" : "bg-saffron text-saffron-ink",
        )}
      >
        {done ? "✓" : n}
      </span>
      {title}
    </h2>
  );
}
