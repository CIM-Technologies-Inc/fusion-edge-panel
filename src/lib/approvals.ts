import { supabase } from "./supabase";

/** A product awaiting admin approval. */
export type PendingProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  approval_status: string;
  image_url: string | null;
  company_name: string | null;
  updated_at: string | null;
};

/** Load every product in the "pending" approval state (admin-only via RLS). */
export async function loadPendingProducts(): Promise<{
  products: PendingProduct[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, sku, approval_status, updated_at,
       company:companies ( name ),
       images:product_images ( url, position, variation_id )`
    )
    .eq("approval_status", "pending")
    .order("updated_at", { ascending: false });

  if (error) {
    // Before migration 0027 the column doesn't exist — treat as "none pending".
    if (/approval_status/i.test(error.message))
      return { products: [], error: null };
    return { products: [], error: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: PendingProduct[] = (data as any[]).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const main = (p.images ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((i: any) => i.variation_id === null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.position - b.position)[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      approval_status: p.approval_status,
      image_url: main?.url ?? null,
      company_name: p.company?.name ?? null,
      updated_at: p.updated_at ?? null,
    };
  });

  return { products, error: null };
}

/** A field-value pair for the review page. `value` is already display-ready. */
export type ReviewField = {
  key: string;
  label: string;
  current: string;
  previous: string | null;
  changed: boolean;
};

export type ProductReview = {
  id: string;
  name: string;
  slug: string;
  approval_status: string;
  company_name: string | null;
  images: string[];
  fields: ReviewField[];
  /** True when there's no prior approved snapshot (first submission). */
  firstSubmission: boolean;
};

const peso = (c: unknown) =>
  typeof c === "number" ? `₱${(c / 100).toFixed(2)}` : "—";

const asText = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

/** Turn an attributes/variations array from a snapshot into a readable string. */
const listText = (v: unknown): string => {
  if (!Array.isArray(v) || v.length === 0) return "—";
  return v
    .map((row) => {
      if (row && typeof row === "object") {
        const o = row as Record<string, unknown>;
        if ("attribute" in o) {
          const vals = Array.isArray(o.values) ? o.values.join(", ") : "";
          return `${o.attribute}: ${vals}${
            o.used_for_variations ? " (variations)" : ""
          }`;
        }
        // variation
        const terms = Array.isArray(o.terms) ? o.terms.join(" / ") : "";
        return `${terms || "Variation"} — ${peso(o.price_cents)}${
          o.sku ? ` [${o.sku}]` : ""
        }`;
      }
      return String(row);
    })
    .join("\n");
};

/**
 * Load a product for the review page: its current snapshot (via RPC) plus the
 * last-approved snapshot, diffed field-by-field so the page can highlight
 * what changed. Admin-only (the product read is RLS-gated).
 */
export async function loadProductReview(slug: string): Promise<{
  review: ProductReview | null;
  error: string | null;
}> {
  // Resolve the product id + stored approved snapshot from the slug.
  const { data: prod, error: pErr } = await supabase
    .from("products")
    .select(
      `id, name, slug, approval_status, approved_snapshot,
       company:companies ( name ),
       images:product_images ( url, position, variation_id )`
    )
    .eq("slug", slug)
    .maybeSingle();
  if (pErr) return { review: null, error: pErr.message };
  if (!prod) return { review: null, error: "Product not found." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prod as any;

  // Current state, built by the same SQL used at approval time.
  const { data: snap, error: sErr } = await supabase.rpc("product_snapshot", {
    pid: p.id,
  });
  if (sErr) return { review: null, error: sErr.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cur = (snap ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev = (p.approved_snapshot ?? null) as Record<string, any> | null;
  const firstSubmission = !prev;

  const rows: {
    key: string;
    label: string;
    render: (v: unknown) => string;
  }[] = [
    { key: "name", label: "Name", render: asText },
    { key: "sku", label: "SKU", render: asText },
    { key: "kind", label: "Type", render: asText },
    { key: "category", label: "Category", render: asText },
    { key: "brand", label: "Brand", render: asText },
    { key: "company", label: "Company", render: asText },
    { key: "price_cents", label: "Price", render: peso },
    { key: "sale_price_cents", label: "Sale price", render: peso },
    { key: "short_description", label: "Short description", render: asText },
    { key: "description", label: "Description", render: asText },
    { key: "in_stock", label: "In stock", render: asText },
    { key: "featured", label: "Featured", render: asText },
    {
      key: "images",
      label: "Images",
      render: (v) => (Array.isArray(v) ? `${v.length} image(s)` : "—"),
    },
    { key: "attributes", label: "Attributes", render: listText },
    { key: "variations", label: "Variations", render: listText },
  ];

  const fields: ReviewField[] = rows.map((r) => {
    const current = r.render(cur[r.key]);
    const previous = prev ? r.render(prev[r.key]) : null;
    // Compare the raw JSON so ordering/format differences don't false-positive.
    const changed =
      !firstSubmission &&
      JSON.stringify(cur[r.key] ?? null) !==
        JSON.stringify(prev?.[r.key] ?? null);
    return { key: r.key, label: r.label, current, previous, changed };
  });

  const images: string[] = (p.images ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((i: any) => i.variation_id === null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.position - b.position)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => i.url);

  return {
    review: {
      id: p.id,
      name: p.name,
      slug: p.slug,
      approval_status: p.approval_status,
      company_name: p.company?.name ?? null,
      images,
      fields,
      firstSubmission,
    },
    error: null,
  };
}

/** Approve a product — makes it live (published). Admin-only (enforced in SQL). */
export async function approveProduct(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("approve_product", { pid: id });
  return { error: error?.message ?? null };
}

/**
 * Cancel a pending approval request — reverts the product to a draft so it can
 * be edited again. Allowed for an admin or the product's own company user.
 */
export async function cancelProductApproval(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("cancel_product_approval", { pid: id });
  return { error: error?.message ?? null };
}

/** Reject a product — keeps it unpublished, with an optional reason. */
export async function rejectProduct(
  id: string,
  reason?: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reject_product", {
    pid: id,
    reason: reason ?? null,
  });
  return { error: error?.message ?? null };
}
