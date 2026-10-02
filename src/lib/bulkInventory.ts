import { supabase } from "./supabase";
import type { ProductKind } from "../types/catalogue";

/** A variation row in the bulk inventory editor. */
export type BulkInvVariation = {
  id: string;
  sku: string | null;
  /** Term names joined, e.g. "Oak / 140cm". */
  label: string;
  quantity: number;
};

/** A product (with its variations) in the bulk inventory editor. */
export type BulkInvProduct = {
  id: string;
  name: string;
  slug: string;
  kind: ProductKind;
  sku: string | null;
  company_id: string | null;
  /** Simple products carry their own quantity; variable ones track per variation. */
  quantity: number;
  variations: BulkInvVariation[];
};

/** One edited quantity, as the input string. */
export type QtyEdit = { quantity: string };

/**
 * Load products the caller can manage, with variations and quantities, for bulk
 * inventory editing. RLS scopes reads; the page filters to the caller's company
 * (admins pass companyId = null for all).
 */
export async function loadBulkInventory(companyId?: string | null): Promise<{
  products: BulkInvProduct[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, kind, sku, company_id, quantity,
       variations (
         id, sku, quantity, position,
         variation_terms ( term:attribute_terms ( name ) )
       )`
    )
    .order("name");

  if (error) return { products: [], error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = data as any[];
  if (companyId) rows = rows.filter((p) => p.company_id === companyId);

  const products: BulkInvProduct[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    kind: p.kind,
    sku: p.sku,
    company_id: p.company_id ?? null,
    quantity: p.quantity ?? 0,
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
        quantity: v.quantity ?? 0,
      })),
  }));

  return { products, error: null };
}

/** Parse a quantity input to a non-negative integer; "" -> null (skip). */
function toQty(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) return NaN;
  return Math.floor(n);
}

/**
 * Save bulk quantity edits. `productEdits` keys are product ids (simple
 * products); `variationEdits` keys are variation ids. in_stock is derived by a
 * DB trigger from quantity, so we only write quantity.
 */
export async function saveBulkInventory(
  productEdits: Record<string, QtyEdit>,
  variationEdits: Record<string, QtyEdit>
): Promise<{ error: string | null; saved: number }> {
  let saved = 0;

  for (const [id, e] of Object.entries(productEdits)) {
    const q = toQty(e.quantity);
    if (q === null) continue;
    if (Number.isNaN(q))
      return { error: "A quantity must be a whole number ≥ 0.", saved };
    const { error } = await supabase
      .from("products")
      .update({ quantity: q })
      .eq("id", id);
    if (error) return { error: error.message, saved };
    saved++;
  }

  for (const [id, e] of Object.entries(variationEdits)) {
    const q = toQty(e.quantity);
    if (q === null) continue;
    if (Number.isNaN(q))
      return { error: "A quantity must be a whole number ≥ 0.", saved };
    const { error } = await supabase
      .from("variations")
      .update({ quantity: q })
      .eq("id", id);
    if (error) return { error: error.message, saved };
    saved++;
  }

  return { error: null, saved };
}
