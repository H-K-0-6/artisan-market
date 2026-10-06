"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPayment, getBenefitPayConfig, recordBenefitPayCharge } from "@/server/actions/checkout";

// Tap's BenefitPay web SDK (vanilla build). It bundles its own React and draws into
// its own element, so it doesn't clash with the app's React version.
const SDK_SRC = "https://tap-sdks.b-cdn.net/benefit-pay/build-1.0.10/main.js";
const ELEMENT_ID = "benefit-pay-button";

type Sdk = {
  render: (config: object, elementId: string) => { unmount: () => void };
  Locale?: Record<string, string>;
  Edges?: Record<string, string>;
};
declare global {
  interface Window {
    TapBenefitpaySDK?: Sdk;
  }
}

let sdkPromise: Promise<Sdk> | null = null;
function loadSdk(): Promise<Sdk> {
  if (window.TapBenefitpaySDK) return Promise.resolve(window.TapBenefitpaySDK);
  sdkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => (window.TapBenefitpaySDK ? resolve(window.TapBenefitpaySDK) : reject(new Error("BenefitPay SDK missing")));
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Couldn't load BenefitPay"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

type Phase = "loading" | "ready" | "confirming" | "error";

export function BenefitPayButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const handle = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { config, error } = await getBenefitPayConfig(orderId);
      if (cancelled) return;
      if (!config) {
        setPhase("error");
        setMessage(error ?? "BenefitPay isn't available right now.");
        return;
      }
      let sdk: Sdk;
      try {
        sdk = await loadSdk();
      } catch {
        if (!cancelled) {
          setPhase("error");
          setMessage("BenefitPay couldn't load. Check your connection, or pay with BENEFIT or a card.");
        }
        return;
      }
      if (cancelled) return;
      handle.current = sdk.render(
        {
          environment: config.environment,
          operator: { publicKey: config.publicKey, hashString: config.hashString },
          debug: process.env.NODE_ENV !== "production",
          merchant: { id: config.merchantId },
          transaction: { amount: config.amount, currency: config.currency },
          reference: config.reference,
          customer: {
            names: [{ lang: sdk.Locale?.EN ?? "en", first: config.customer.first, last: config.customer.last }],
            contact: { email: config.customer.email },
          },
          interface: { locale: sdk.Locale?.EN ?? "en", edges: sdk.Edges?.CURVED ?? "curved" },
          post: { url: config.postUrl },
          onReady: () => !cancelled && setPhase("ready"),
          onCancel: () => setMessage("BenefitPay was closed before paying. You can try again."),
          onError: (err: unknown) => {
            console.error("[benefitpay]", err);
            setMessage("BenefitPay reported an error. Try again, or pay with BENEFIT or a card.");
          },
          // Called once the buyer finishes in the BenefitPay app, with Tap's charge id.
          // Link it to the order (a no-op if the webhook already did), then ask Tap
          // for the result rather than trusting the browser.
          onSuccess: async (charge: { id?: string }) => {
            setPhase("confirming");
            if (charge?.id) await recordBenefitPayCharge(orderId, charge.id);
            const res = await confirmPayment(orderId);
            if (res.status === "PAID") router.push(`/checkout/success?order=${orderId}`);
            else {
              setPhase("ready");
              setMessage(res.error ?? "We're still waiting for BenefitPay to confirm. Check your orders in a minute.");
            }
          },
        },
        ELEMENT_ID,
      );
    })();
    return () => {
      cancelled = true;
      handle.current?.unmount();
      handle.current = null;
    };
  }, [orderId, router]);

  return (
    <div className="grid gap-3">
      <div id={ELEMENT_ID} className="min-h-12" />
      {phase === "loading" && <p className="text-sm text-muted-foreground">Loading BenefitPay…</p>}
      {phase === "confirming" && <p className="text-sm font-medium text-indigo">Confirming your payment…</p>}
      {message && <p className="text-sm font-medium text-madder">{message}</p>}
    </div>
  );
}
