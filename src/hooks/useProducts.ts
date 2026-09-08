import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Product, ProductImage } from "../types/catalogue";

const buildSelect = (withSupplier: boolean) => `
  id, name, slug, sku, kind, short_description,
  price_cents, sale_price_cents, price_max_cents,
  in_stock, featured, published, created_at,
  ${withSupplier ? "supplier_id," : ""}
  category:categories ( id, name, slug ),
  images:product_images ( id, url, alt, position, variation_id )
`;

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Prefer selecting supplier_id; fall back until 0011 has run.
    const preferred = await supabase
      .from("products")
      .select(buildSelect(true))
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] | null = preferred.data as any;
    let errMsg: string | null = preferred.error?.message ?? null;

    if (preferred.error && /supplier/i.test(preferred.error.message)) {
      const fallback = await supabase
        .from("products")
        .select(buildSelect(false))
        .order("created_at", { ascending: false });
      data = fallback.data as any;
      errMsg = fallback.error?.message ?? null;
    }

    if (errMsg) {
      setError(errMsg);
      setProducts([]);
    } else {
      // Position 0 is the main image; the rest are thumbnails.
      const rows = (data ?? []).map((p) => ({
        ...p,
        images: [...(p.images ?? [])].sort(
          (a: ProductImage, b: ProductImage) => a.position - b.position
        ),
      })) as unknown as Product[];
      setProducts(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { products, loading, error, reload: load };
}
