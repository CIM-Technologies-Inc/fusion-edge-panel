import { supabase } from "./supabase";
import { centsToInput } from "./price";
import { toCsv } from "./csv";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * WooCommerce-style product export.
 *
 * One CSV, one row per item: a simple product is one row; a variable product is
 * a parent row (Type=variable) followed by one row per variation (Type=variation)
 * linked to the parent by SKU. Attributes are emitted as numbered name/value(s)
 * pairs ("Attribute 1 name" / "Attribute 1 value(s)"), Woo-style, so the file is
 * import-ready. IDs and SKUs are included so an importer can match rows.
 */

type ExportProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  kind: string;
  short_description: string | null;
  description: string | null;
  price_cents: number | null;
  sale_price_cents: number | null;
  quantity: number | null;
  in_stock: boolean;
  published: boolean;
  featured: boolean;
  category: string;
  brand: string;
  company: string;
  /** Product-level attributes in order: name + all its values. */
  attributes: { name: string; values: string[]; forVariations: boolean }[];
  variations: {
    id: string;
    sku: string | null;
    price_cents: number | null;
    sale_price_cents: number | null;
    quantity: number | null;
    in_stock: boolean;
    /** attribute name -> chosen value for this variation. */
    options: Record<string, string>;
  }[];
};

async function fetchExportProducts(
  productIds: string[]
): Promise<{ products: ExportProduct[]; error: string | null }> {
  if (productIds.length === 0) return { products: [], error: null };

  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, sku, kind, short_description, description,
       price_cents, sale_price_cents, quantity, in_stock, published, featured,
       category:categories ( name ),
       brand:brands ( name ),
       company:companies ( name ),
       product_attributes (
         position, used_for_variations,
         attribute:attributes ( id, name ),
         product_attribute_terms (
           position, term:attribute_terms ( id, name )
         )
       ),
       variations (
         id, sku, price_cents, sale_price_cents, quantity, in_stock, position,
         variation_terms (
           attribute:attributes ( name ),
           term:attribute_terms ( name )
         )
       )`
    )
    .in("id", productIds);

  if (error) return { products: [], error: error.message };

  const products: ExportProduct[] = ((data as any[]) ?? []).map((p) => {
    const attributes = [...(p.product_attributes ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((pa: any) => ({
        name: pa.attribute?.name ?? "",
        forVariations: !!pa.used_for_variations,
        values: [...(pa.product_attribute_terms ?? [])]
          .sort((a: any, b: any) => a.position - b.position)
          .map((pat: any) => pat.term?.name)
          .filter(Boolean),
      }))
      .filter((a: any) => a.name);

    const variations = [...(p.variations ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((v: any) => {
        const options: Record<string, string> = {};
        for (const vt of v.variation_terms ?? []) {
          const an = vt.attribute?.name;
          const tn = vt.term?.name;
          if (an && tn) options[an] = tn;
        }
        return {
          id: v.id,
          sku: v.sku,
          price_cents: v.price_cents,
          sale_price_cents: v.sale_price_cents,
          quantity: v.quantity ?? null,
          in_stock: v.in_stock,
          options,
        };
      });

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku ?? null,
      kind: p.kind,
      short_description: p.short_description ?? null,
      description: p.description ?? null,
      price_cents: p.price_cents,
      sale_price_cents: p.sale_price_cents,
      quantity: p.quantity ?? null,
      in_stock: p.in_stock,
      published: p.published,
      featured: p.featured,
      category: p.category?.name ?? "",
      brand: p.brand?.name ?? "",
      company: p.company?.name ?? "",
      attributes,
      variations,
    };
  });

  // Preserve the order of the ids passed in (the filtered/sorted list).
  const order = new Map(productIds.map((id, i) => [id, i]));
  products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { products, error: null };
}

/**
 * Build the Woo-style CSV for the given product ids (the filtered list).
 * Fetches attributes + variations just-in-time.
 */
export async function buildWooProductCsv(
  productIds: string[]
): Promise<{ csv: string | null; rowCount: number; error: string | null }> {
  const { products, error } = await fetchExportProducts(productIds);
  if (error) return { csv: null, rowCount: 0, error };
  if (products.length === 0)
    return { csv: null, rowCount: 0, error: null };

  // How many attribute columns do we need? The max across all products.
  const maxAttrs = products.reduce(
    (m, p) => Math.max(m, p.attributes.length),
    0
  );

  type Row = Record<string, string | number>;
  const rows: Row[] = [];

  const baseCols = (): {
    header: string;
    value: (r: Row) => string | number;
  }[] => {
    const cols: { header: string; value: (r: Row) => string | number }[] = [
      { header: "ID", value: (r) => r.ID ?? "" },
      { header: "Type", value: (r) => r.Type ?? "" },
      { header: "SKU", value: (r) => r.SKU ?? "" },
      { header: "Parent", value: (r) => r.Parent ?? "" },
      { header: "Name", value: (r) => r.Name ?? "" },
      { header: "Published", value: (r) => r.Published ?? "" },
      { header: "Featured", value: (r) => r.Featured ?? "" },
      { header: "Category", value: (r) => r.Category ?? "" },
      { header: "Brand", value: (r) => r.Brand ?? "" },
      { header: "Company", value: (r) => r.Company ?? "" },
      { header: "Short description", value: (r) => r["Short description"] ?? "" },
      { header: "Description", value: (r) => r.Description ?? "" },
      { header: "Regular price", value: (r) => r["Regular price"] ?? "" },
      { header: "Sale price", value: (r) => r["Sale price"] ?? "" },
      { header: "Quantity", value: (r) => r.Quantity ?? "" },
      { header: "In stock", value: (r) => r["In stock"] ?? "" },
      { header: "Slug", value: (r) => r.Slug ?? "" },
    ];
    for (let i = 1; i <= maxAttrs; i++) {
      cols.push({
        header: `Attribute ${i} name`,
        value: (r) => r[`Attribute ${i} name`] ?? "",
      });
      cols.push({
        header: `Attribute ${i} value(s)`,
        value: (r) => r[`Attribute ${i} value(s)`] ?? "",
      });
    }
    return cols;
  };

  for (const p of products) {
    // Parent (or simple) row.
    const parent: Row = {
      ID: p.id,
      Type: p.kind, // "simple" | "variable"
      SKU: p.sku ?? "",
      Parent: "",
      Name: p.name,
      Published: p.published ? "1" : "0",
      Featured: p.featured ? "1" : "0",
      Category: p.category,
      Brand: p.brand,
      Company: p.company,
      "Short description": p.short_description ?? "",
      Description: p.description ?? "",
      "Regular price": centsToInput(p.price_cents),
      "Sale price": centsToInput(p.sale_price_cents),
      Quantity: p.quantity ?? "",
      "In stock": p.in_stock ? "1" : "0",
      Slug: p.slug,
    };
    p.attributes.forEach((a, idx) => {
      parent[`Attribute ${idx + 1} name`] = a.name;
      parent[`Attribute ${idx + 1} value(s)`] = a.values.join(", ");
    });
    rows.push(parent);

    // Variation rows (variable products only).
    for (const v of p.variations) {
      const row: Row = {
        ID: v.id,
        Type: "variation",
        SKU: v.sku ?? "",
        Parent: p.sku ?? p.slug, // link back to the parent
        Name: p.name,
        Published: p.published ? "1" : "0",
        Featured: "",
        Category: p.category,
        Brand: p.brand,
        Company: p.company,
        "Short description": "",
        Description: "",
        "Regular price": centsToInput(v.price_cents),
        "Sale price": centsToInput(v.sale_price_cents),
        Quantity: v.quantity ?? "",
        "In stock": v.in_stock ? "1" : "0",
        Slug: "",
      };
      // A variation fills the SAME attribute columns as its parent, with its
      // single chosen value in each.
      p.attributes.forEach((a, idx) => {
        row[`Attribute ${idx + 1} name`] = a.name;
        row[`Attribute ${idx + 1} value(s)`] = v.options[a.name] ?? "";
      });
      rows.push(row);
    }
  }

  const csv = toCsv(rows, baseCols());
  return { csv, rowCount: rows.length, error: null };
}
