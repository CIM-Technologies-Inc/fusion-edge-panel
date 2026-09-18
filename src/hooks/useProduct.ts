import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ProductDetail } from "../types/catalogue";

// Relations that need the 0005_brands / 0007 migrations. Kept separate so we
// can fall back to a brand/company-free query until those migrations run,
// rather than breaking every product page (the join errors otherwise).
const BRAND_SELECT = `
  brand:brands ( id, name, slug ),
  company:companies ( id, name, slug ),`;

const buildSelect = (
  withBrand: boolean,
  withModel: boolean,
  withMeta: boolean,
  withApproval: boolean
) => `
  id, name, slug, sku, kind, description, short_description,
  price_cents, sale_price_cents, price_max_cents,
  in_stock, quantity, featured, published, ${withApproval ? "approval_status, rejection_reason," : ""} created_at,
  ${withModel ? "model_3d_url, supplier_id," : ""}
  category:categories ( id, name, slug ),
  ${withBrand ? BRAND_SELECT : ""}
  images:product_images ( id, url, alt, position, variation_id ),
  product_attributes (
    id, used_for_variations, position, default_term_id,
    attribute:attributes ( id, name, slug, display_type, position ),
    product_attribute_terms (
      id, position,
      term:attribute_terms ( id, name, slug, swatch, position )
    )
  ),
  variations (
    id, sku, price_cents, sale_price_cents, quantity, in_stock, position,
    variation_terms ( attribute_id, term_id )${
      withMeta
        ? `,
    variation_meta ( name, value, position )`
        : ""
    }
  )
`;

const byPosition = <T extends { position: number }>(a: T, b: T) =>
  a.position - b.position;

/** Flattens the nested join rows into the shapes the UI works with. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(row: any): ProductDetail {
  return {
    ...row,
    images: [...(row.images ?? [])].sort(byPosition),
    attributes: [...(row.product_attributes ?? [])]
      .sort(byPosition)
      .map((pa: any) => ({
        id: pa.id,
        used_for_variations: pa.used_for_variations,
        default_term_id: pa.default_term_id ?? null,
        position: pa.position,
        attribute: pa.attribute,
        terms: [...(pa.product_attribute_terms ?? [])]
          .sort(byPosition)
          .map((pat: any) => pat.term),
      })),
    variations: [...(row.variations ?? [])].sort(byPosition).map((v: any) => ({
      id: v.id,
      sku: v.sku,
      price_cents: v.price_cents,
      sale_price_cents: v.sale_price_cents,
      in_stock: v.in_stock,
      position: v.position,
      terms: v.variation_terms ?? [],
      meta: [...(v.variation_meta ?? [])].sort(byPosition),
    })),
  };
}

export function useProduct(slug: string | undefined) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    // Prefer the full query; progressively drop the brand/company relations
    // (need 0005/0007) and the model_3d_url column (needs 0008) until it works,
    // so a not-yet-run migration never breaks the whole product page.
    const attempts: [boolean, boolean, boolean, boolean][] = [
      [true, true, true, true],
      [true, true, true, false],
      [true, true, false, false],
      [true, false, false, false],
      [false, true, false, false],
      [false, false, false, false],
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    let error: { message: string } | null = null;
    for (const [withBrand, withModel, withMeta, withApproval] of attempts) {
      const res = await supabase
        .from("products")
        .select(buildSelect(withBrand, withModel, withMeta, withApproval))
        .eq("slug", slug)
        .maybeSingle();
      data = res.data;
      error = res.error;
      // Stop once it succeeds, or on an error that isn't about these columns.
      if (
        !error ||
        !/brand|compan|model_3d|supplier|variation_meta|approval_status/i.test(
          error.message
        )
      )
        break;
    }

    if (error) {
      setError(error.message);
      setProduct(null);
    } else {
      setProduct(data ? normalise(data) : null);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { product, loading, error, reload: load };
}
