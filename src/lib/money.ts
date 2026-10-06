// The store sells in Bahraini dinars. Amounts are integers in the minor unit
// (fils, 1 BHD = 1000 fils) everywhere in the database and the code; the
// "*Cents" names on fields predate the switch from USD and mean "minor units".

export const APP_CURRENCY = "BHD";
/** Minor units per major unit (1000 fils per dinar). */
export const MINOR_PER_MAJOR = 1000;
export const CURRENCY_DECIMALS = 3;

const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: CURRENCY_DECIMALS,
  maximumFractionDigits: CURRENCY_DECIMALS,
});

/** "BD 18.100", the way prices are written in Bahrain. */
export const formatCents = (minor: number) => `BD ${number.format(minor / MINOR_PER_MAJOR)}`;

/** Compact form for chart axes: "BD 1.2k". */
export const formatCompact = (minor: number) =>
  `BD ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(minor / MINOR_PER_MAJOR)}`;

/** Major units with exactly 3 decimals, as Tap expects for BHD ("18.100"). */
export const toMajorString = (minor: number) => (minor / MINOR_PER_MAJOR).toFixed(CURRENCY_DECIMALS);

/**
 * Parses a user-entered amount ("18.1", "BD 18.100", "18") into fils, or null.
 * Accepts at most 3 decimal places.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^(BD|BHD)\s*/i, "").replace(/,/g, "");
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * MINOR_PER_MAJOR);
}

/** Commission in basis points (1000 = 10%), rounded to whole fils. */
export const commissionCents = (amountMinor: number, bps: number) => Math.round((amountMinor * bps) / 10_000);
