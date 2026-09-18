import { supabase } from "./supabase";
import type { ProductAttribute } from "../types/catalogue";

/**
 * One free-typed extra attribute on a variation (e.g. Material) with its
 * values (Oak, Teak). Descriptive only — doesn't define the variation.
 */
export type VariationMetaDraft = {
  name: string;
  values: string[];
};

/** A variation as the editor holds it, before it is saved. */
export type VariationDraft = {
  /** Existing row id, or null for one not yet saved. */
  id: string | null;
  /** attribute_id -> term_id. One entry per variation attribute. */
  terms: Record<string, string>;
  price: string;
  sale_price: string;
  sku: string;
  /** Inventory count (as a string for the input); in_stock derives from it. */
  quantity: string;
  in_stock: boolean;
  image_url: string;
  position: number;
  /** Free-typed extra attributes on this variation. */
  meta: VariationMetaDraft[];
};

/** Stable key for a combination, so duplicates are easy to spot. */
export function comboKey(terms: Record<string, string>): string {
  return Object.entries(terms)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([a, t]) => `${a}:${t}`)
    .join("|");
}

/**
 * Every combination of the given variation attributes — the Cartesian product
 * that WooCommerce's "generate variations" produces.
 */
export function allCombinations(
  attributes: ProductAttribute[]
): Record<string, string>[] {
  const usable = attributes.filter((a) => a.terms.length > 0);
  if (usable.length === 0) return [];

  return usable.reduce<Record<string, string>[]>(
    (acc, attr) =>
      acc.flatMap((combo) =>
        attr.terms.map((term) => ({ ...combo, [attr.attribute.id]: term.id }))
      ),
    [{}]
  );
}

function centsFrom(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n)) return NaN;
  return Math.round(n * 100);
}

/** Mirrors the DB constraints so problems surface before the round trip. */
export function validateVariations(drafts: VariationDraft[]): string | null {
  const seen = new Set<string>();

  for (const [i, d] of drafts.entries()) {
    const label = `Variation ${i + 1}`;

    // price_cents is NOT NULL in the schema.
    const price = centsFrom(d.price);
    if (price === null) return `${label}: price is required.`;
    if (Number.isNaN(price)) return `${label}: price must be a number.`;
    if (price < 0) return `${label}: price cannot be negative.`;

    const sale = centsFrom(d.sale_price);
    if (sale !== null && Number.isNaN(sale))
      return `${label}: sale price must be a number.`;
    if (sale !== null && sale >= price)
      return `${label}: sale price must be below the price.`;

    // SKU is required on every variation.
    if (!d.sku.trim()) return `${label}: SKU is required.`;

    // variation_terms' PK is (variation_id, attribute_id) — one term each.
    const key = comboKey(d.terms);
    if (seen.has(key)) return `${label}: duplicate combination.`;
    seen.add(key);
  }

  // sku is UNIQUE across all variations (and, at the DB level, across products).
  const skus = drafts.map((d) => d.sku.trim()).filter(Boolean);
  if (new Set(skus).size !== skus.length)
    return "Two variations share the same SKU.";

  return null;
}

/**
 * Replace a product's variations with the given drafts.
 *
 * Deleting and re-inserting keeps the join rows consistent (variation_terms
 * has no upsert key of its own) and lets the price trigger recompute the
 * product's range from the final set.
 */
export async function saveVariations(
  productId: string,
  drafts: VariationDraft[]
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from("variations")
    .delete()
    .eq("product_id", productId);
  if (delErr) return { error: delErr.message };

  if (drafts.length === 0) return { error: null };

  const rows = drafts.map((d, position) => ({
    product_id: productId,
    sku: d.sku.trim() || null,
    price_cents: Math.round(Number(d.price) * 100),
    sale_price_cents: d.sale_price.trim()
      ? Math.round(Number(d.sale_price) * 100)
      : null,
    quantity: Math.max(0, Math.floor(Number(d.quantity) || 0)),
    position,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("variations")
    .insert(rows)
    .select("id, position");
  if (insErr || !inserted) return { error: insErr?.message ?? "Save failed." };

  // Match inserted rows back to drafts by the position we just assigned.
  const idByPosition = new Map(inserted.map((r) => [r.position, r.id as string]));

  const termRows = drafts.flatMap((d, position) => {
    const id = idByPosition.get(position);
    if (!id) return [];
    return Object.entries(d.terms)
      // Skip attributes with no value chosen — inserting an empty term_id
      // (not a valid UUID) would fail the FK/uuid check.
      .filter(([attribute_id, term_id]) => attribute_id && term_id)
      .map(([attribute_id, term_id]) => ({
        variation_id: id,
        attribute_id,
        term_id,
      }));
  });

  if (termRows.length > 0) {
    const { error } = await supabase.from("variation_terms").insert(termRows);
    if (error) return { error: error.message };
  }

  // Per-variation images live in product_images with a variation_id.
  const imageRows = drafts.flatMap((d, position) => {
    const id = idByPosition.get(position);
    const url = d.image_url.trim();
    if (!id || !url) return [];
    return [{ product_id: productId, variation_id: id, url, alt: null, position: 0 }];
  });

  if (imageRows.length > 0) {
    const { error } = await supabase.from("product_images").insert(imageRows);
    if (error) return { error: error.message };
  }

  // Per-variation extra attributes → variation_meta (one row per value).
  // Deleting the variations above already cascade-removed their old meta rows.
  const metaRows = drafts.flatMap((d, position) => {
    const id = idByPosition.get(position);
    if (!id) return [];
    return (d.meta ?? []).flatMap((m) => {
      const name = m.name.trim();
      if (!name) return [];
      return m.values
        .map((v) => v.trim())
        .filter(Boolean)
        .map((value, vPos) => ({
          variation_id: id,
          name,
          value,
          position: vPos,
        }));
    });
  });

  if (metaRows.length > 0) {
    const { error } = await supabase.from("variation_meta").insert(metaRows);
    // Tolerate the table not existing yet (before 0009) so saving still works.
    if (error && !/variation_meta/i.test(error.message))
      return { error: error.message };
  }

  return { error: null };
}
