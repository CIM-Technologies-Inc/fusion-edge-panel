import { supabase } from "./supabase";
import type { Product, ProductKind } from "../types/catalogue";

/** Editable fields on the products row. Variations are managed separately. */
export type ProductEdit = {
  name: string;
  slug: string;
  sku: string | null;
  category_id: string | null;
  /** Required at the app level; every product carries a brand. */
  brand_id: string | null;
  /** Required at the app level; the brand is filtered by this company. */
  company_id: string | null;
  /** Optional URL to a glTF/GLB 3D model. */
  model_3d_url: string | null;
  /** Owning supplier's profile id, or null (admin-managed). */
  supplier_id: string | null;
  short_description: string | null;
  description: string | null;
  /** null for variable products — the trigger maintains their price. */
  price_cents: number | null;
  sale_price_cents: number | null;
  in_stock: boolean;
  featured: boolean;
  published: boolean;
};

/** Everything needed to create a product row (kind + category + images). */
export type ProductCreate = ProductEdit & {
  kind: ProductKind;
  category_id: string | null;
  /** Image URLs, first is the main image (position 0). */
  image_urls: string[];
};

/** Turn a name into a URL slug: lowercase, hyphenated, stripped of junk. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Client-side mirror of the DB constraints, so we can show a clear message
 * before the round-trip. The database still enforces these regardless.
 */
export function validate(edit: ProductEdit, kind: Product["kind"]): string | null {
  if (!edit.name.trim()) return "Name is required.";
  if (!edit.slug.trim()) return "Slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edit.slug))
    return "Slug must be lowercase words separated by hyphens.";

  if (kind === "simple" && edit.price_cents === null)
    return "A simple product must have a price.";

  if (edit.price_cents !== null && edit.price_cents < 0)
    return "Price cannot be negative.";

  if (
    edit.sale_price_cents !== null &&
    edit.price_cents !== null &&
    edit.sale_price_cents >= edit.price_cents
  )
    return "Sale price must be below the regular price.";

  return null;
}

export async function updateProduct(
  id: string,
  edit: ProductEdit
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("products").update(edit).eq("id", id);
  return { error: error?.message ?? null };
}

/**
 * Delete a product. Its variations, images and attribute links are removed by
 * ON DELETE CASCADE; RLS lets admins delete any, suppliers only their own.
 */
export async function deleteProduct(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/** Per-field error messages, keyed by form field name. Empty = valid. */
export type FieldErrors = Partial<
  Record<
    | "name"
    | "slug"
    | "sku"
    | "category"
    | "brand"
    | "company"
    | "price"
    | "sale_price"
    | "images",
    string
  >
>;

/**
 * Field-level validation for the product forms. Mirrors the DB constraints
 * but reports each problem against its field so the UI can show a red border
 * and a message inline, rather than one lumped error.
 */
export function validateFields(input: {
  name: string;
  slug: string;
  kind: ProductKind;
  price_cents: number | null;
  sale_price_cents: number | null;
  /** Image URLs. Pass [] to skip image checks (edit form doesn't touch them). */
  image_urls?: string[];
  /**
   * Selected category id. Pass a string (even "") to require a category;
   * omit entirely to skip the check (e.g. a form that allows no category).
   */
  category_id?: string;
  /**
   * Selected brand id. Pass a string (even "") to require a brand; omit to
   * skip the check.
   */
  brand_id?: string;
  /**
   * Selected company id. Pass a string (even "") to require a company; omit to
   * skip the check.
   */
  company_id?: string;
  /**
   * SKU. Pass a string (even "") to require it; omit to skip. Only enforced on
   * simple products — a variable product's SKUs live on its variations.
   */
  sku?: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.name.trim()) errors.name = "Name is required.";

  if (!input.slug.trim()) errors.slug = "Slug is required.";
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim()))
    errors.slug = "Lowercase words separated by hyphens.";

  // SKU required on simple products (variable products get SKUs per variation).
  if (
    input.sku !== undefined &&
    input.kind === "simple" &&
    !input.sku.trim()
  )
    errors.sku = "SKU is required.";

  if (input.category_id !== undefined && !input.category_id)
    errors.category = "Choose a category.";

  if (input.company_id !== undefined && !input.company_id)
    errors.company = "Choose a company.";

  if (input.brand_id !== undefined && !input.brand_id)
    errors.brand = "Choose a brand.";

  if (input.kind === "simple" && input.price_cents === null)
    errors.price = "A price is required.";
  else if (input.price_cents !== null && input.price_cents < 0)
    errors.price = "Price cannot be negative.";

  if (
    input.sale_price_cents !== null &&
    input.price_cents !== null &&
    input.sale_price_cents >= input.price_cents
  )
    errors.sale_price = "Must be below the regular price.";

  if (input.image_urls) {
    if (input.image_urls.length === 0)
      errors.images = "Add at least one image URL.";
    else if (input.image_urls.some((u) => !/^https?:\/\/|^\//.test(u.trim())))
      errors.images = "URLs must start with http(s):// or /.";
  }

  return errors;
}

/**
 * Replace a product's default (non-variation) images with the given URLs.
 *
 * Only rows with variation_id IS NULL are touched — per-variation images stay
 * put, since they belong to a variation's gallery, not the product's.
 */
export async function syncProductImages(
  productId: string,
  productName: string,
  urls: string[]
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId)
    .is("variation_id", null);
  if (delErr) return { error: delErr.message };

  const rows = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, position) => ({
      product_id: productId,
      variation_id: null,
      url,
      alt: productName,
      position,
    }));

  if (rows.length === 0) return { error: null };

  const { error } = await supabase.from("product_images").insert(rows);
  return { error: error?.message ?? null };
}

/** Build a slug that doesn't collide with an existing one: foo, foo-2, foo-3… */
function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Deep-copy a product: its row, images, attribute assignments and (for a
 * variable product) its variations with their terms.
 *
 * The copy is always created unpublished — a duplicate is a draft to edit,
 * and publishing it by accident would put a half-finished product live. SKUs
 * are dropped because they are UNIQUE in the schema.
 */
export async function duplicateProduct(
  productId: string
): Promise<{ error: string | null; slug: string | null }> {
  // 1. Read the source in full.
  const { data: src, error: readErr } = await supabase
    .from("products")
    .select(
      `id, name, slug, kind, category_id, brand_id, company_id, model_3d_url, supplier_id,
       short_description, description,
       price_cents, sale_price_cents, in_stock, featured,
       product_images ( url, alt, position, variation_id ),
       product_attributes ( attribute_id, used_for_variations, position,
         product_attribute_terms ( term_id, position ) ),
       variations ( id, price_cents, sale_price_cents, in_stock, position,
         variation_terms ( attribute_id, term_id ) )`
    )
    .eq("id", productId)
    .single();

  if (readErr || !src) {
    return { error: readErr?.message ?? "Product not found.", slug: null };
  }

  // 2. Pick a free slug.
  const { data: allSlugs } = await supabase.from("products").select("slug");
  const taken = new Set((allSlugs ?? []).map((r) => r.slug as string));
  const slug = uniqueSlug(`${src.slug}-copy`, taken);
  const isVariable = src.kind === "variable";

  // 3. The product row. Variable prices are trigger-owned, so leave them null.
  const { data: created, error: insErr } = await supabase
    .from("products")
    .insert({
      name: `${src.name} (copy)`,
      slug,
      kind: src.kind,
      sku: null,
      category_id: src.category_id,
      brand_id: src.brand_id,
      company_id: src.company_id,
      model_3d_url: src.model_3d_url,
      supplier_id: src.supplier_id,
      short_description: src.short_description,
      description: src.description,
      price_cents: isVariable ? null : src.price_cents,
      sale_price_cents: isVariable ? null : src.sale_price_cents,
      in_stock: src.in_stock,
      featured: src.featured,
      published: false,
    })
    .select("id, slug")
    .single();

  if (insErr || !created) {
    return { error: insErr?.message ?? "Could not copy product.", slug: null };
  }

  // Undo the partial copy so a failure doesn't leave a broken product behind.
  const rollback = async (msg: string) => {
    await supabase.from("products").delete().eq("id", created.id);
    return { error: msg, slug: null };
  };

  // 4. Attributes, keeping each assignment's chosen terms.
  type SrcPa = {
    attribute_id: string;
    used_for_variations: boolean;
    position: number;
    product_attribute_terms: { term_id: string; position: number }[];
  };
  const srcPas = (src.product_attributes ?? []) as unknown as SrcPa[];

  if (srcPas.length > 0) {
    const { data: newPas, error: paErr } = await supabase
      .from("product_attributes")
      .insert(
        srcPas.map((pa) => ({
          product_id: created.id,
          attribute_id: pa.attribute_id,
          used_for_variations: pa.used_for_variations,
          position: pa.position,
        }))
      )
      .select("id, attribute_id");
    if (paErr || !newPas) return rollback(paErr?.message ?? "Attribute copy failed.");

    const paIdByAttr = new Map(newPas.map((r) => [r.attribute_id, r.id as string]));
    const patRows = srcPas.flatMap((pa) => {
      const newId = paIdByAttr.get(pa.attribute_id);
      if (!newId) return [];
      return (pa.product_attribute_terms ?? []).map((t) => ({
        product_attribute_id: newId,
        term_id: t.term_id,
        position: t.position,
      }));
    });
    if (patRows.length > 0) {
      const { error } = await supabase
        .from("product_attribute_terms")
        .insert(patRows);
      if (error) return rollback(error.message);
    }
  }

  // 5. Variations, remembering old→new ids so images can follow.
  type SrcVar = {
    id: string;
    price_cents: number;
    sale_price_cents: number | null;
    in_stock: boolean;
    position: number;
    variation_terms: { attribute_id: string; term_id: string }[];
  };
  const srcVars = (src.variations ?? []) as unknown as SrcVar[];
  const newVarByOld = new Map<string, string>();

  if (srcVars.length > 0) {
    const { data: newVars, error: vErr } = await supabase
      .from("variations")
      .insert(
        srcVars.map((v) => ({
          product_id: created.id,
          sku: null,
          price_cents: v.price_cents,
          sale_price_cents: v.sale_price_cents,
          in_stock: v.in_stock,
          position: v.position,
        }))
      )
      .select("id, position");
    if (vErr || !newVars) return rollback(vErr?.message ?? "Variation copy failed.");

    // Match old to new by position, which we inserted in the same order.
    const byPosition = new Map(newVars.map((v) => [v.position, v.id as string]));
    for (const v of srcVars) {
      const newId = byPosition.get(v.position);
      if (newId) newVarByOld.set(v.id, newId);
    }

    const vtRows = srcVars.flatMap((v) => {
      const newId = newVarByOld.get(v.id);
      if (!newId) return [];
      return (v.variation_terms ?? []).map((t) => ({
        variation_id: newId,
        attribute_id: t.attribute_id,
        term_id: t.term_id,
      }));
    });
    if (vtRows.length > 0) {
      const { error } = await supabase.from("variation_terms").insert(vtRows);
      if (error) return rollback(error.message);
    }
  }

  // 6. Images — product-level ones plus any attached to a copied variation.
  type SrcImg = {
    url: string;
    alt: string | null;
    position: number;
    variation_id: string | null;
  };
  const srcImgs = (src.product_images ?? []) as unknown as SrcImg[];

  if (srcImgs.length > 0) {
    const imgRows = srcImgs
      .map((img) => ({
        product_id: created.id,
        variation_id: img.variation_id
          ? newVarByOld.get(img.variation_id) ?? null
          : null,
        url: img.url,
        alt: img.alt,
        position: img.position,
      }))
      .filter((r) => r.url);
    const { error } = await supabase.from("product_images").insert(imgRows);
    if (error) return rollback(error.message);
  }

  return { error: null, slug: created.slug };
}

export function validateCreate(create: ProductCreate): string | null {
  // Reuse the shared row checks first.
  const base = validate(create, create.kind);
  if (base) return base;

  if (create.image_urls.length === 0)
    return "Add at least one image URL.";
  if (create.image_urls.some((u) => !/^https?:\/\/|^\//.test(u.trim())))
    return "Image URLs must start with http(s):// or /.";

  return null;
}

/**
 * Creates a product and its images. For a simple product this is a `products`
 * row plus one-or-more `product_images` rows. Returns the new slug on success.
 *
 * If the image insert fails, the just-created product is rolled back by hand —
 * there is no client transaction, and a product with no image is a broken
 * listing.
 */
export async function createProduct(
  create: ProductCreate
): Promise<{ error: string | null; slug: string | null; id: string | null }> {
  const isVariable = create.kind === "variable";

  const row = {
    name: create.name.trim(),
    slug: create.slug.trim(),
    sku: create.sku,
    kind: create.kind,
    category_id: create.category_id,
    brand_id: create.brand_id,
    company_id: create.company_id,
    model_3d_url: create.model_3d_url,
    supplier_id: create.supplier_id,
    short_description: create.short_description,
    description: create.description,
    // Variable products leave price null — the trigger fills the range.
    price_cents: isVariable ? null : create.price_cents,
    sale_price_cents: isVariable ? null : create.sale_price_cents,
    in_stock: create.in_stock,
    featured: create.featured,
    published: create.published,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("products")
    .insert(row)
    .select("id, slug")
    .single();

  if (insErr || !inserted) {
    return {
      error: insErr?.message ?? "Could not create product.",
      slug: null,
      id: null,
    };
  }

  const images = create.image_urls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, position) => ({
      product_id: inserted.id,
      variation_id: null,
      url,
      alt: create.name.trim(),
      position,
    }));

  const { error: imgErr } = await supabase.from("product_images").insert(images);

  if (imgErr) {
    // Roll back the orphaned product so a retry starts clean.
    await supabase.from("products").delete().eq("id", inserted.id);
    return {
      error: `Saved product but images failed: ${imgErr.message}`,
      slug: null,
      id: null,
    };
  }

  return { error: null, slug: inserted.slug, id: inserted.id };
}
