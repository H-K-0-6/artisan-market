import { describe, expect, it } from "vitest";
import { commissionCents, formatCents, parseDollars } from "@/lib/money";

describe("money", () => {
  it("parses dollar strings into cents", () => {
    expect(parseDollars("12.50")).toBe(1250);
    expect(parseDollars("$3")).toBe(300);
    expect(parseDollars("0.1")).toBe(10);
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("-1")).toBeNull();
  });

  it("computes commission in basis points, rounded to cents", () => {
    expect(commissionCents(10_000, 1000)).toBe(1000);
    expect(commissionCents(999, 1000)).toBe(100);
  });

  it("formats cents as USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});
