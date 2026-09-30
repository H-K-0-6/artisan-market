const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatCents = (cents: number) => usd.format(cents / 100);

/** Parses a user-entered dollar amount ("12.50") into integer cents, or null. */
export function parseDollars(input: string): number | null {
  const n = Number(input.trim().replace(/^\$/, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Commission in basis points (1000 = 10%), rounded to whole cents. */
export const commissionCents = (amountCents: number, bps: number) =>
  Math.round((amountCents * bps) / 10_000);
