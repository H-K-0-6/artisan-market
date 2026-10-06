import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { benefitPayHash, chargeMethod, verifyChargeWebhook, type TapCharge } from "@/lib/tap";

const KEY = "sk_test_unit_only";
beforeAll(() => {
  process.env.TAP_SECRET_KEY = KEY;
});

const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

const charge: TapCharge = {
  id: "chg_TS01",
  status: "CAPTURED",
  amount: 25,
  currency: "BHD",
  reference: { gateway: "123456", payment: "4206251234" },
  transaction: { created: "1791295516506" },
};

describe("Tap webhook signature (hashstring)", () => {
  // Formula from developers.tap.company/docs/webhook, amounts rounded to the
  // currency's decimals (3 for BHD).
  const expected = hmac(
    "x_idchg_TS01x_amount25.000x_currencyBHDx_gateway_reference123456x_payment_reference4206251234x_statusCAPTUREDx_created1791295516506",
  );

  it("accepts the hash Tap computes", () => {
    expect(verifyChargeWebhook(charge, expected)).toBe(true);
  });

  it("rejects a missing or altered hash, or an altered charge", () => {
    expect(verifyChargeWebhook(charge, null)).toBe(false);
    const flipped = expected.slice(0, -1) + (expected.endsWith("0") ? "1" : "0");
    expect(verifyChargeWebhook(charge, flipped)).toBe(false);
    expect(verifyChargeWebhook({ ...charge, amount: 2.5 }, expected)).toBe(false);
    expect(verifyChargeWebhook({ ...charge, status: "DECLINED" }, expected)).toBe(false);
  });

  it("uses an empty string for a missing gateway reference", () => {
    const noGateway = { ...charge, reference: { payment: "4206251234" } };
    const h = hmac("x_idchg_TS01x_amount25.000x_currencyBHDx_gateway_referencex_payment_reference4206251234x_statusCAPTUREDx_created1791295516506");
    expect(verifyChargeWebhook(noGateway, h)).toBe(true);
  });
});

describe("BenefitPay request signature", () => {
  it("signs public key, amount, currency, transaction and post URL", () => {
    const input = { publicKey: "pk_test_x", amount: "18.100", currency: "BHD", transaction: "ord_1_t", postUrl: "https://example.com/api/webhooks/tap" };
    expect(benefitPayHash(input)).toBe(
      hmac("x_publickeypk_test_xx_amount18.100x_currencyBHDx_transactionord_1_tx_posthttps://example.com/api/webhooks/tap"),
    );
  });
});

describe("chargeMethod", () => {
  it("names the method from Tap's source", () => {
    expect(chargeMethod({ ...charge, source: { id: "src_bh.benefit", payment_method: "BENEFIT" } })).toBe("BENEFIT");
    expect(chargeMethod({ ...charge, source: { id: "src_benefit_pay", payment_method: "BENEFITPAY" } })).toBe("BENEFITPAY");
    expect(chargeMethod({ ...charge, source: { id: "src_card", payment_method: "VISA" } })).toBe("CARD");
    expect(chargeMethod({ ...charge, source: undefined })).toBeNull();
  });
});
