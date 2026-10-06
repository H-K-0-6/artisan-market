// Minimal client for the Tap Payments API (https://developers.tap.company).
// No "server-only" import: the pg-boss jobs in the tsx custom server use it too.
// It reads the secret key, so it must never be imported by client components.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.tap.company/v2";

/** Tap source ids for the payment methods we offer. */
export const TAP_SOURCES = {
  BENEFIT: "src_bh.benefit", // BENEFIT debit card, redirect to the BENEFIT page
  CARD: "src_card", // Visa / Mastercard, redirect to Tap's card page
  BENEFITPAY: "src_benefit_pay", // BenefitPay wallet, via Tap's BenefitPay web SDK (QR)
} as const;
export type RedirectMethod = "BENEFIT" | "CARD";
export type PaymentMethod = keyof typeof TAP_SOURCES;

/** Charge statuses. CAPTURED is the only success; INITIATED / IN_PROGRESS are still open. */
export const OPEN_STATUSES = new Set(["INITIATED", "IN_PROGRESS"]);
export const FAILED_STATUSES = new Set(["ABANDONED", "CANCELLED", "FAILED", "DECLINED", "RESTRICTED", "VOID", "TIMEDOUT", "UNKNOWN"]);

export type TapCharge = {
  id: string;
  object?: string;
  live_mode?: boolean;
  status: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  reference?: { transaction?: string; order?: string; gateway?: string; payment?: string };
  transaction?: { url?: string; created?: string };
  source?: { id?: string; payment_method?: string };
  response?: { code?: string; message?: string };
};

export class TapError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "TapError";
  }
}

function secretKey() {
  const key = process.env.TAP_SECRET_KEY;
  if (!key) throw new Error("TAP_SECRET_KEY is not set");
  return key;
}

async function tap<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${secretKey()}`, "content-type": "application/json", accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
  if (!res.ok || data.errors) {
    const message = data.errors?.map((e) => e.description).join("; ") || `Tap request failed (${res.status})`;
    throw new TapError(message, res.status, data.errors);
  }
  return data;
}

export type CreateChargeInput = {
  amount: string; // major units with 3 decimals for BHD
  currency: string;
  sourceId: string;
  description: string;
  reference: { transaction: string; order: string };
  metadata: Record<string, string>;
  customer: { first_name: string; last_name?: string; email: string };
  postUrl: string;
  redirectUrl: string;
};

export function createCharge(input: CreateChargeInput) {
  return tap<TapCharge>("/charges", {
    method: "POST",
    body: {
      amount: Number(input.amount),
      currency: input.currency,
      threeDSecure: true,
      save_card: false,
      description: input.description,
      reference: input.reference,
      metadata: input.metadata,
      receipt: { email: true, sms: false },
      customer: input.customer,
      source: { id: input.sourceId },
      post: { url: input.postUrl },
      redirect: { url: input.redirectUrl },
    },
  });
}

export const retrieveCharge = (chargeId: string) => tap<TapCharge>(`/charges/${encodeURIComponent(chargeId)}`);

export function createRefund(input: { chargeId: string; amount: string; currency: string; reason: "duplicate" | "requested_by_customer"; reference: string }) {
  return tap<{ id: string; status: string }>("/refunds", {
    method: "POST",
    body: {
      charge_id: input.chargeId,
      amount: Number(input.amount),
      currency: input.currency,
      reason: input.reason,
      reference: { merchant: input.reference },
      metadata: { reason: "order no longer payable" },
    },
  });
}

const DECIMALS: Record<string, number> = { BHD: 3, KWD: 3, OMR: 3, JOD: 3 };
const fmtAmount = (amount: number, currency: string) => Number(amount).toFixed(DECIMALS[currency] ?? 2);

const hmac = (text: string) => createHmac("sha256", secretKey()).update(text).digest("hex");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifies the `hashstring` header Tap sends with a charge webhook:
 * HMAC-SHA256 over x_id..x_amount..x_currency..x_gateway_reference..
 * x_payment_reference..x_status..x_created, keyed with the secret key.
 */
export function verifyChargeWebhook(charge: TapCharge, hashHeader: string | null) {
  if (!hashHeader) return false;
  const text =
    `x_id${charge.id}` +
    `x_amount${fmtAmount(charge.amount, charge.currency)}` +
    `x_currency${charge.currency}` +
    `x_gateway_reference${charge.reference?.gateway ?? ""}` +
    `x_payment_reference${charge.reference?.payment ?? ""}` +
    `x_status${charge.status}` +
    `x_created${charge.transaction?.created ?? ""}`;
  return safeEqual(hmac(text), hashHeader);
}

/** Signs the BenefitPay SDK request so the amount and reference can't be changed in the browser. */
export function benefitPayHash(input: { publicKey: string; amount: string; currency: string; transaction: string; postUrl: string }) {
  return hmac(
    `x_publickey${input.publicKey}x_amount${input.amount}x_currency${input.currency}x_transaction${input.transaction}x_post${input.postUrl}`,
  );
}

/** Our payment method name for a charge, from Tap's source info. */
export function chargeMethod(charge: TapCharge): string | null {
  const pm = charge.source?.payment_method?.toUpperCase();
  if (pm === "BENEFIT" || pm === "BENEFITPAY") return pm;
  if (charge.source?.id === TAP_SOURCES.BENEFITPAY) return "BENEFITPAY";
  if (charge.source?.id === TAP_SOURCES.BENEFIT) return "BENEFIT";
  return pm ? "CARD" : null;
}
