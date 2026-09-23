export type ProductKind = "simple" | "variable";

export type ProductImage = {
  id: string;
  url: string;
  alt: string | null;
  position: number;
  variation_id: string | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
};

/** A category row with the management fields the admin page edits. */
export type CategoryFull = Category & {
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  position: number;
  /** Number of products in this category — filled in by the admin query. */
  product_count?: number;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
};

/** A brand row with the management fields the admin page edits. */
export type BrandFull = Brand & {
  description: string | null;
  logo_url: string | null;
  position: number;
  /** Owning company. NULL = a global brand (visible to everyone). */
  company_id?: string | null;
  /** Company ids this brand belongs to (many-to-many). */
  company_ids?: string[];
  /** Number of products with this brand — filled in by the admin query. */
  product_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
};

/** A company row with the management fields the admin page edits. */
export type CompanyFull = Company & {
  description: string | null;
  logo_url: string | null;
  position: number;
  /** Brand ids assigned to this company (edited on the Company page). */
  brand_ids?: string[];
  /** Number of brands under this company — filled in by the admin query. */
  brand_count?: number;
};

export type DisplayType = "select" | "button" | "color" | "image";

export type AttributeTerm = {
  id: string;
  name: string;
  slug: string;
  /** Hex for a `color` attribute, image url for `image`. */
  swatch: string | null;
  position: number;
  /**
   * Owning product for a private value; null (or absent) means a shared/global
   * value. Only present when the pool was loaded with a productId — used to
   * decide whether a value may be edited from the product page.
   */
  product_id?: string | null;
};

export type Attribute = {
  id: string;
  name: string;
  slug: string;
  display_type: DisplayType;
  position: number;
};

/** A global attribute with its full term pool — the reusable definition. */
export type AttributeWithTerms = Attribute & {
  terms: AttributeTerm[];
};

/** An attribute as offered by one product, narrowed to its own terms. */
export type ProductAttribute = {
  id: string;
  /** true = a buyable choice forming variations; false = a display-only spec. */
  used_for_variations: boolean;
  position: number;
  attribute: Attribute;
  terms: AttributeTerm[];
  /** Term preselected on the product page. Null means no default. */
  default_term_id?: string | null;
};

/** One free-typed extra attribute value on a variation (Material = Oak). */
export type VariationMeta = {
  name: string;
  value: string;
  position: number;
};

/** One buyable combination. `terms` is one entry per attribute. */
export type Variation = {
  id: string;
  sku: string | null;
  price_cents: number;
  sale_price_cents: number | null;
  quantity?: number;
  in_stock: boolean;
  position: number;
  terms: { attribute_id: string; term_id: string }[];
  /** Free-typed extra attributes attached to this variation. */
  meta: VariationMeta[];
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  kind: ProductKind;
  short_description: string | null;
  /** Integer cents. For variable products this is the low end of the range. */
  price_cents: number | null;
  sale_price_cents: number | null;
  /** Integer cents. Set by trigger on variable products only. */
  price_max_cents: number | null;
  in_stock: boolean;
  /** Inventory count (drives in_stock). Simple products & variations carry it. */
  quantity?: number;
  featured: boolean;
  published: boolean;
  /** draft | pending | approved | rejected — 'pending' awaits admin approval. */
  approval_status?: string;
  /** Reason an admin gave when rejecting; shown to the company-user. */
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Optional URL to a glTF/GLB 3D model. */
  model_3d_url: string | null;
  /** Owning supplier's profile id, or null (admin-managed). */
  supplier_id: string | null;
  /** Owning company id (for scoping); the `company` object may not be loaded. */
  company_id: string | null;
  category: Category | null;
  brand: Brand | null;
  company: Company | null;
  images: ProductImage[];
};

export type ProductDetail = Product & {
  description: string | null;
  attributes: ProductAttribute[];
  variations: Variation[];
};
