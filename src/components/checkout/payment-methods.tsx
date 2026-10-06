"use client";

import { useState, useTransition } from "react";
import { CreditCardIcon, LandmarkIcon, QrCodeIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { payWith } from "@/server/actions/checkout";
import { BenefitPayButton } from "@/components/checkout/benefit-pay-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Method = "BENEFIT" | "BENEFITPAY" | "CARD";

const METHODS: { id: Method; label: string; detail: string; icon: LucideIcon }[] = [
  { id: "BENEFIT", label: "BENEFIT debit card", detail: "Pay with your Bahraini bank card on the BENEFIT page. You'll need your card PIN.", icon: LandmarkIcon },
  { id: "BENEFITPAY", label: "BenefitPay", detail: "Scan a QR code with the BenefitPay app, or open it on your phone.", icon: QrCodeIcon },
  { id: "CARD", label: "Credit or debit card", detail: "Visa or Mastercard, on Tap's secure card page.", icon: CreditCardIcon },
];

export function PaymentMethods({ orderId, total, disabled }: { orderId: string; total: string; disabled?: boolean }) {
  const [method, setMethod] = useState<Method>("BENEFIT");
  const [pending, startTransition] = useTransition();

  const pay = (m: "BENEFIT" | "CARD") =>
    startTransition(async () => {
      const res = await payWith(orderId, m); // redirects to Tap on success
      if (res?.error) toast.error(res.error);
    });

  return (
    <div className={cn("grid gap-4", disabled && "pointer-events-none opacity-50")} aria-disabled={disabled}>
      <div role="radiogroup" aria-label="Payment method" className="grid gap-3">
        {METHODS.map((m) => {
          const selected = method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => setMethod(m.id)}
              className={cn(
                "flex items-start gap-4 rounded-2xl border bg-card p-4 text-left transition-colors",
                selected ? "border-indigo ring-2 ring-indigo/15" : "hover:border-indigo/40",
              )}
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", selected ? "bg-indigo text-white dark:text-indigo-deep" : "bg-muted text-muted-foreground")}>
                <m.icon className="size-5" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{m.label}</span>
                <span className="text-sm text-muted-foreground">{m.detail}</span>
              </span>
              <span
                aria-hidden
                className={cn("ml-auto mt-1 size-5 shrink-0 rounded-full border-2", selected ? "border-indigo bg-indigo shadow-[inset_0_0_0_3px_var(--card)]" : "border-input")}
              />
            </button>
          );
        })}
      </div>

      {!disabled && method === "BENEFITPAY" ? (
        <BenefitPayButton orderId={orderId} />
      ) : (
        <Button size="lg" className="h-12 text-base" disabled={disabled || pending} onClick={() => pay(method === "CARD" ? "CARD" : "BENEFIT")}>
          {pending ? "Opening the payment page…" : `Pay ${total} with ${method === "CARD" ? "card" : "BENEFIT"}`}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Payments are processed by Tap Payments. We never see your card details or PIN.</p>
    </div>
  );
}
