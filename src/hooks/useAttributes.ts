import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AttributeWithTerms } from "../types/catalogue";

const byPos = <T extends { position: number }>(a: T, b: T) =>
  a.position - b.position;

/**
 * The attribute pool for a builder.
 *
 * Global terms (product_id IS NULL) are always included. When `productId` is
 * given, that product's own private terms are included too, and other
 * products' private terms are excluded — so a product only ever sees the
 * shared library plus its own custom values.
 *
 * Omit `productId` (e.g. the Attributes admin page) to see global terms only.
 */
export function useAttributes(productId?: string) {
  const [attributes, setAttributes] = useState<AttributeWithTerms[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Preferred query: needs attribute_terms.product_id (its migration).
    const termFilter = productId
      ? `product_id.is.null,product_id.eq.${productId}`
      : `product_id.is.null`;

    const preferred = await supabase
      .from("attributes")
      .select(
        `
        id, name, slug, display_type, position, filterable,
        terms:attribute_terms ( id, name, slug, swatch, position, product_id )
      `
      )
      .or(termFilter, { referencedTable: "attribute_terms" })
      .order("position");

    // Fall back gracefully until add_product_owned_terms.sql has been run:
    // load every term (the old behaviour) rather than blanking the page.
    let data: unknown = preferred.data;
    if (preferred.error) {
      const fallback = await supabase
        .from("attributes")
        .select(
          `
          id, name, slug, display_type, position,
          terms:attribute_terms ( id, name, slug, swatch, position )
        `
        )
        .order("position");
      data = fallback.data;
    }

    const rows = ((data as AttributeWithTerms[] | null) ?? []).map((a) => ({
      ...a,
      terms: [...(a.terms ?? [])].sort(byPos),
    }));

    setAttributes(rows.sort(byPos));
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  return { attributes, loading, reload: load };
}
