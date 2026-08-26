import type { Product } from "../types/catalogue";

const fmt = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/** Centavos are integers in the database — divide only at the display edge. */
export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return fmt.format(cents / 100);
}

/** A cents value as a plain peso string for an input field, e.g. "113.79". */
export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

/** Parse a peso input back to integer centavos; empty -> null, invalid -> NaN. */
export function inputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const dollars = Number(trimmed);
  if (Number.isNaN(dollars)) return NaN;
  return Math.round(dollars * 100);
}

/**
 * Variable products carry a trigger-maintained range; show "low – high"
 * unless both ends are the same.
 */
export function formatPrice(product: Product): string {
  const { price_cents, price_max_cents, kind } = product;
  if (price_cents === null) return "—";

  if (
    kind === "variable" &&
    price_max_cents !== null &&
    price_max_cents !== price_cents
  ) {
    return `${formatCents(price_cents)} – ${formatCents(price_max_cents)}`;
  }
  return formatCents(price_cents);
}
