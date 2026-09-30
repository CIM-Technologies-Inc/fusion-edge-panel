import { supabase } from "./supabase";
import { parseCsv } from "./csv";
import { inputToCents } from "./price";
import { slugify, createProduct } from "./products";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CSV import for the WooCommerce-style product export template.
 *
 * Flow: parse → build a plan (create/update/error per product) → the caller
 * shows the plan on a review page → applyImport() writes the confirmed plan.
 *
 * Rules (decided with the product owner):
 *  - Match existing by ID, else SKU. Matched → UPDATE in place, keep status.
 *    Unmatched → CREATE as a DRAFT (published = false).
 *  - Company / Brand / Category are matched BY NAME; if a name isn't found the
 *    row is an error (never auto-created).
 *  - Required category attributes are NOT enforced here — drafts are allowed;
 *    they're enforced later when publishing.
 *  - Variation rows (Type = variation) attach to the preceding parent by their
 *    Parent column (its SKU) or by appearing under it.
 */

export type PlanAction = "create" | "update" | "error";

export type VariationPlan = {
  sku: string;
  priceCents: number | null;
  salePriceCents: number | null;
  quantity: number;
  /** attribute name -> value for this variation. */
  options: Record<string, string>;
};

export type ProductPlan = {
  /** 1-based CSV line for messaging. */
  line: number;
  action: PlanAction;
  /** Populated when action is "error". */
  errors: string[];
  /** Existing product id when updating. */
  existingId: string | null;
  kind: "simple" | "variable";
  name: string;
  slug: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string;
  brandId: string | null;
  brandName: string;
  companyId: string | null;
  companyName: string;
  shortDescription: string | null;
  description: string | null;
  priceCents: number | null;
  salePriceCents: number | null;
  quantity: number;
  variations: VariationPlan[];
};

export type ImportPlan = {
  products: ProductPlan[];
  error: string | null;
};

/** Read the numbered Attribute N name/value(s) pairs from a CSV row. */
function readAttributes(
  row: Record<string, string>
): { name: string; values: string[] }[] {
  const out: { name: string; values: string[] }[] = [];
  for (let i = 1; ; i++) {
    const name = row[`Attribute ${i} name`];
    if (name === undefined) break; // no more columns
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    const raw = row[`Attribute ${i} value(s)`] ?? "";
    const values = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    out.push({ name: trimmed, values });
  }
  return out;
}

/**
 * Parse the CSV text and build the import plan, resolving references and
 * classifying each product. Read-only — writes nothing.
 */
export async function buildImportPlan(text: string): Promise<ImportPlan> {
  const rows = parseCsv(text);
  if (rows.length === 0)
    return { products: [], error: "The file is empty or has no data rows." };

  // Required columns check (from the export template).
  const required = ["Type", "Name"];
  const missing = required.filter((c) => !(c in rows[0]));
  if (missing.length > 0)
    return {
      products: [],
      error: `Missing expected column(s): ${missing.join(
        ", "
      )}. Use the Export CSV template.`,
    };

  // Reference lookups by lowercased name.
  const [catRes, brandRes, compRes, prodRes] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("brands").select("id, name, company_id"),
    supabase.from("companies").select("id, name"),
    supabase.from("products").select("id, sku"),
  ]);

  const anyErr =
    catRes.error || brandRes.error || compRes.error || prodRes.error;
  if (anyErr) return { products: [], error: anyErr.message };

  const catByName = new Map(
    (catRes.data ?? []).map((c: any) => [c.name.trim().toLowerCase(), c.id])
  );
  const compByName = new Map(
    (compRes.data ?? []).map((c: any) => [c.name.trim().toLowerCase(), c.id])
  );
  // Brands can repeat names across companies; key by "company_id|name".
  const brandByKey = new Map(
    (brandRes.data ?? []).map((b: any) => [
      `${b.company_id}|${b.name.trim().toLowerCase()}`,
      b.id,
    ])
  );
  const productIdBySku = new Map(
    (prodRes.data ?? [])
      .filter((p: any) => p.sku)
      .map((p: any) => [String(p.sku).trim().toLowerCase(), p.id])
  );
  const productIds = new Set((prodRes.data ?? []).map((p: any) => p.id));

  const products: ProductPlan[] = [];
  let current: ProductPlan | null = null;

  rows.forEach((row, idx) => {
    const line = idx + 2; // +1 header, +1 to 1-base
    const type = (row.Type || "").trim().toLowerCase();

    // Variation row → attach to the current parent.
    if (type === "variation") {
      if (!current) {
        products.push(errorPlan(line, row.Name || "(variation)", [
          "Variation row has no preceding product.",
        ]));
        return;
      }
      const opts: Record<string, string> = {};
      for (const a of readAttributes(row)) {
        if (a.values[0]) opts[a.name] = a.values[0];
      }
      current.variations.push({
        sku: (row.SKU || "").trim(),
        priceCents: inputToCents(row["Regular price"] || ""),
        salePriceCents: inputToCents(row["Sale price"] || ""),
        quantity: Math.max(0, Math.floor(Number(row.Quantity) || 0)),
        options: opts,
      });
      return;
    }

    // Product row (simple | variable). Finalize previous.
    const errors: string[] = [];
    const name = (row.Name || "").trim();
    if (!name) errors.push("Name is required.");

    const kind: "simple" | "variable" =
      type === "variable" ? "variable" : "simple";

    // Resolve references by name (must exist).
    const companyName = (row.Company || "").trim();
    const companyId = companyName
      ? compByName.get(companyName.toLowerCase()) ?? null
      : null;
    if (companyName && !companyId)
      errors.push(`Company "${companyName}" not found.`);

    const brandName = (row.Brand || "").trim();
    let brandId: string | null = null;
    if (brandName) {
      brandId = companyId
        ? brandByKey.get(`${companyId}|${brandName.toLowerCase()}`) ?? null
        : null;
      if (!brandId)
        errors.push(
          companyId
            ? `Brand "${brandName}" not found in company "${companyName}".`
            : `Brand "${brandName}" needs a valid Company to resolve.`
        );
    }

    const categoryName = (row.Category || "").trim();
    const categoryId = categoryName
      ? catByName.get(categoryName.toLowerCase()) ?? null
      : null;
    if (categoryName && !categoryId)
      errors.push(`Category "${categoryName}" not found.`);

    // Match existing by ID then SKU.
    const id = (row.ID || "").trim();
    const sku = (row.SKU || "").trim();
    let existingId: string | null = null;
    if (id && productIds.has(id)) existingId = id;
    else if (sku && productIdBySku.has(sku.toLowerCase()))
      existingId = productIdBySku.get(sku.toLowerCase())!;

    const plan: ProductPlan = {
      line,
      action: errors.length > 0 ? "error" : existingId ? "update" : "create",
      errors,
      existingId,
      kind,
      name,
      slug: slugify(name),
      sku: sku || null,
      categoryId,
      categoryName,
      brandId,
      brandName,
      companyId,
      companyName,
      shortDescription: (row["Short description"] || "").trim() || null,
      description: (row.Description || "").trim() || null,
      priceCents:
        kind === "variable" ? null : inputToCents(row["Regular price"] || ""),
      salePriceCents:
        kind === "variable" ? null : inputToCents(row["Sale price"] || ""),
      quantity: Math.max(0, Math.floor(Number(row.Quantity) || 0)),
      variations: [],
    };
    // Published/Featured captured only to keep existing status on update; new
    // products are forced to draft at apply time.
    products.push(plan);
    current = plan;
  });

  return { products, error: null };
}

function errorPlan(line: number, name: string, errors: string[]): ProductPlan {
  return {
    line,
    action: "error",
    errors,
    existingId: null,
    kind: "simple",
    name,
    slug: "",
    sku: null,
    categoryId: null,
    categoryName: "",
    brandId: null,
    brandName: "",
    companyId: null,
    companyName: "",
    shortDescription: null,
    description: null,
    priceCents: null,
    salePriceCents: null,
    quantity: 0,
    variations: [],
  };
}

export type ImportResult = {
  created: number;
  updated: number;
  failed: number;
  messages: string[];
};

/**
 * Apply the confirmed plan. Only non-error products are written. New products
 * are created as drafts; existing products are updated in place (status kept).
 * Variations are NOT written here in this first version — see note below.
 */
export async function applyImport(plan: ProductPlan[]): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    failed: 0,
    messages: [],
  };

  for (const p of plan) {
    if (p.action === "error") continue;

    if (p.action === "create") {
      const { error } = await createProduct({
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        kind: p.kind,
        category_id: p.categoryId,
        brand_id: p.brandId,
        company_id: p.companyId,
        model_3d_url: null,
        supplier_id: null,
        short_description: p.shortDescription,
        description: p.description,
        price_cents: p.priceCents,
        sale_price_cents: p.salePriceCents,
        quantity: p.quantity,
        in_stock: p.quantity > 0,
        featured: false,
        published: false, // always a draft on import
        image_urls: [],
      });
      if (error) {
        result.failed++;
        result.messages.push(`Line ${p.line} (${p.name}): ${error}`);
      } else {
        result.created++;
      }
    } else if (p.action === "update" && p.existingId) {
      // Update only the scalar fields the CSV carries, so we don't blank out
      // fields it doesn't include. Status/published is left untouched.
      const patch: Record<string, unknown> = {
        name: p.name,
        sku: p.sku,
        category_id: p.categoryId,
        brand_id: p.brandId,
        company_id: p.companyId,
        short_description: p.shortDescription,
        description: p.description,
      };
      if (p.kind === "simple") {
        patch.price_cents = p.priceCents;
        patch.sale_price_cents = p.salePriceCents;
        patch.quantity = p.quantity;
        patch.in_stock = p.quantity > 0;
      }
      const { error } = await supabase
        .from("products")
        .update(patch)
        .eq("id", p.existingId);
      if (error) {
        result.failed++;
        result.messages.push(`Line ${p.line} (${p.name}): ${error}`);
      } else {
        result.updated++;
      }
    }
  }

  return result;
}
