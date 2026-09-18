import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Product, ProductImage } from "../types/catalogue";

const buildSelect = (withSupplier: boolean, withApproval: boolean) => `
  id, name, slug, sku, kind, short_description,
  price_cents, sale_price_cents, price_max_cents,
  in_stock, featured, published, ${withApproval ? "approval_status," : ""} created_at,
  ${withSupplier ? "supplier_id, company_id," : "company_id,"}
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

    // Scope by company: a non-admin who BELONGS to a company only fetches that
    // company's products. Admins and non-admin staff WITHOUT a company see all
    // products (page-level permission gates decide whether they get here at
    // all, and which actions they can take).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    let scopeCompanyId: string | null = null;
    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, company_id")
        .eq("id", session.user.id)
        .maybeSingle();
      const isAdminUser = (profile as { is_admin?: boolean } | null)?.is_admin === true;
      const myCompany =
        (profile as { company_id?: string | null } | null)?.company_id ?? null;
      // Only a non-admin WITH a company is scoped to it.
      if (!isAdminUser && myCompany) scopeCompanyId = myCompany;
    }

    // Prefer selecting supplier_id + approval_status; fall back until the
    // matching migrations (0011 / 0027) have run.
    const run = (withSupplier: boolean, withApproval: boolean) => {
      let q = supabase
        .from("products")
        .select(buildSelect(withSupplier, withApproval))
        .order("created_at", { ascending: false });
      if (scopeCompanyId) q = q.eq("company_id", scopeCompanyId);
      return q;
    };

    let res = await run(true, true);

    // Drop approval_status if that column isn't there yet.
    if (res.error && /approval_status/i.test(res.error.message)) {
      res = await run(true, false);
    }
    // Drop supplier_id if that column isn't there yet.
    if (res.error && /supplier/i.test(res.error.message)) {
      res = await run(false, /approval_status/i.test(res.error.message) ? false : true);
      if (res.error && /approval_status/i.test(res.error.message)) {
        res = await run(false, false);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] | null = res.data as any;
    const errMsg: string | null = res.error?.message ?? null;

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
