import { describe, expect, it } from "vitest";
import { commissionCents, formatCents, formatCompact, parseAmount, toMajorString } from "@/lib/money";

describe("money (BHD, 3 decimals, stored in fils)", () => {
  it("parses dinar amounts into fils", () => {
    expect(parseAmount("12.5")).toBe(12_500);
    expect(parseAmount("12.500")).toBe(12_500);
    expect(parseAmount("BD 3")).toBe(3_000);
    expect(parseAmount("BHD 1,250.125")).toBe(1_250_125);
    expect(parseAmount("0.1")).toBe(100);
    expect(parseAmount("1.2345")).toBeNull(); // more than 3 decimals
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-1")).toBeNull();
  });

  it("formats fils the way Bahrain writes prices", () => {
    expect(formatCents(18_100)).toBe("BD 18.100");
    expect(formatCents(1_234_567)).toBe("BD 1,234.567");
    expect(formatCompact(1_250_000)).toBe("BD 1.3K");
  });

  it("gives Tap 3-decimal major-unit amounts", () => {
    expect(toMajorString(25_000)).toBe("25.000");
    expect(toMajorString(125)).toBe("0.125");
  });

  it("computes commission in basis points, rounded to whole fils", () => {
    expect(commissionCents(10_000, 1000)).toBe(1000);
    expect(commissionCents(999, 1000)).toBe(100);
  });
});
