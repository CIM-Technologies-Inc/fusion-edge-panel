import { supabase } from "./supabase";
import type { ProductKind } from "../types/catalogue";

/** A variation row in the bulk editor. */
export type BulkVariation = {
  id: string;
  sku: string | null;
  /** Term names joined, e.g. "Oak / 140cm" — for the label. */
  label: string;
  price_cents: number;
  sale_price_cents: number | null;
};

/** A product (with its variations) in the bulk-price editor. */
export type BulkProduct = {
  id: string;
  name: string;
  slug: string;
  kind: ProductKind;
  sku: string | null;
  supplier_id: string | null;
  /** Simple products carry their own price; variable ones are null here. */
  price_cents: number | null;
  sale_price_cents: number | null;
  variations: BulkVariation[];
};

/** One edited price value, in the "113.79" input form (empty = clear sale). */
export type PriceEdit = {
  price?: string;
  sale?: string;
};

/**
 * Load all products the caller can manage, with variations, for bulk editing.
 * RLS already limits suppliers to their own products.
 */
export async function loadBulkProducts(): Promise<{
  products: BulkProduct[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, kind, sku, supplier_id, price_cents, sale_price_cents,
       variations (
         id, sku, price_cents, sale_price_cents, position,
         variation_terms ( term:attribute_terms ( name ) )
       )`
    )
    .order("name");

  if (error) return { products: [], error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: BulkProduct[] = (data as any[]).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    kind: p.kind,
    sku: p.sku,
    supplier_id: p.supplier_id ?? null,
    price_cents: p.price_cents,
    sale_price_cents: p.sale_price_cents,
    variations: [...(p.variations ?? [])]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.position - b.position)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((v: any) => ({
        id: v.id,
        sku: v.sku,
        label:
          (v.variation_terms ?? [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((vt: any) => vt.term?.name)
            .filter(Boolean)
            .join(" / ") || "Variation",
        price_cents: v.price_cents,
        sale_price_cents: v.sale_price_cents,
      })),
  }));

  return { products, error: null };
}

/** Parse a peso input to integer centavos; "" -> null, invalid -> NaN. */
function toCents(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n)) return NaN;
  return Math.round(n * 100);
}

/**
 * Save bulk price edits. `productEdits` keys are product ids (simple products);
 * `variationEdits` keys are variation ids. Only changed rows should be passed.
 * Validates each (price required & >= 0, sale below price) before writing.
 */
export async function saveBulkPrices(
  productEdits: Record<string, PriceEdit>,
  variationEdits: Record<string, PriceEdit>
): Promise<{ error: string | null; saved: number }> {
  let saved = 0;

  // Simple products.
  for (const [id, e] of Object.entries(productEdits)) {
    const patch: { price_cents?: number; sale_price_cents?: number | null } = {};

    if (e.price !== undefined) {
      const c = toCents(e.price);
      if (c === null) return { error: "A product price is required.", saved };
      if (Number.isNaN(c) || c < 0)
        return { error: "A product price is invalid.", saved };
      patch.price_cents = c;
    }
    if (e.sale !== undefined) {
      const c = toCents(e.sale);
      if (Number.isNaN(c)) return { error: "A sale price is invalid.", saved };
      patch.sale_price_cents = c; // null clears it
    }
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) return { error: error.message, saved };
    saved++;
  }

  // Variations.
  for (const [id, e] of Object.entries(variationEdits)) {
    const patch: { price_cents?: number; sale_price_cents?: number | null } = {};

    if (e.price !== undefined) {
      const c = toCents(e.price);
      if (c === null) return { error: "A variation price is required.", saved };
      if (Number.isNaN(c) || c < 0)
        return { error: "A variation price is invalid.", saved };
      patch.price_cents = c;
    }
    if (e.sale !== undefined) {
      const c = toCents(e.sale);
      if (Number.isNaN(c)) return { error: "A sale price is invalid.", saved };
      patch.sale_price_cents = c;
    }
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("variations")
      .update(patch)
      .eq("id", id);
    if (error) return { error: error.message, saved };
    saved++;
  }

  return { error: null, saved };
}
