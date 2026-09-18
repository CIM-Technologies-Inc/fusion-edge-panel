import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { BrandFull } from "../types/catalogue";

/**
 * Brands with their management fields and a product count.
 *
 * The count comes from a single grouped fetch of product brand ids rather than
 * one count query per row.
 */
export function useBrandsFull() {
  const [brands, setBrands] = useState<BrandFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("brands")
      .select(
        "id, name, slug, description, logo_url, position, company_id, created_at, updated_at"
      )
      .order("position")
      .order("name");

    if (error) {
      setError(error.message);
      setBrands([]);
      setLoading(false);
      return;
    }

    const { data: prods } = await supabase.from("products").select("brand_id");

    const counts = new Map<string, number>();
    for (const p of prods ?? []) {
      const id = (p as { brand_id: string | null }).brand_id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    // Company memberships come from the many-to-many join. Tolerate the table
    // not existing yet (before 0007) by treating a failure as "no links".
    const { data: links } = await supabase
      .from("brand_companies")
      .select("brand_id, company_id");

    const companyIdsByBrand = new Map<string, string[]>();
    for (const l of links ?? []) {
      const bid = (l as { brand_id: string }).brand_id;
      const cid = (l as { company_id: string }).company_id;
      const arr = companyIdsByBrand.get(bid) ?? [];
      arr.push(cid);
      companyIdsByBrand.set(bid, arr);
    }

    setBrands(
      (data as BrandFull[]).map((b) => ({
        ...b,
        company_ids: companyIdsByBrand.get(b.id) ?? [],
        product_count: counts.get(b.id) ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { brands, loading, error, reload: load };
}
