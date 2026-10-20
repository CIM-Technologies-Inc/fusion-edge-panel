import config from "../config/requiredAttributes.json";

export type RequiredAttribute = {
  /** Attribute slug/name, e.g. "data-cim-tile-h". */
  name: string;
  /** Human-readable label shown on the form. */
  label: string;
  /**
   * Input kind for the form field. "rfa" picks a .rfa file from media;
   * "boolean" is a Yes/No toggle storing "yes"/"no"; "select" is a dropdown
   * of fixed `options`.
   */
  type:
    | "text"
    | "number"
    | "url"
    | "color"
    | "image"
    | "rfa"
    | "boolean"
    | "select";
  required: boolean;
  /** Choices for a "select" field. */
  options?: string[];
  /** Value to pre-fill the field with when empty. Optional. */
  default?: string;
  /** When true, the field is shown (with its value) but can't be edited. */
  disabled?: boolean;
};

type ComponentConfig = {
  label: string;
  attributes: RequiredAttribute[];
};

type CategoryConfig = {
  label: string;
  /** A category EITHER lists attributes directly OR offers components. */
  attributes?: RequiredAttribute[];
  components?: Record<string, ComponentConfig>;
};

const categories = (config as { categories: Record<string, CategoryConfig> })
  .categories;

/** Find a category config by slug (case-insensitive). */
function findCategory(categorySlug: string | null | undefined) {
  if (!categorySlug) return null;
  const key = categorySlug.trim().toLowerCase();
  const found = Object.entries(categories).find(
    ([slug]) => slug.toLowerCase() === key
  );
  return found ? found[1] : null;
}

/** A category's components as [{ slug, label }], or [] when it has none. */
export function getComponents(
  categorySlug: string | null | undefined
): { slug: string; label: string }[] {
  const cat = findCategory(categorySlug);
  if (!cat?.components) return [];
  return Object.entries(cat.components).map(([slug, c]) => ({
    slug,
    label: c.label,
  }));
}

/** Whether the category offers components (so the form shows a Component picker). */
export function hasComponents(categorySlug: string | null | undefined): boolean {
  return getComponents(categorySlug).length > 0;
}

/**
 * Resolve a component slug from a saved component-tag value (the locked
 * data-cim-*-component attribute, e.g. "Grout"). Used on the edit page to
 * re-select the component for an existing product. Returns "" if not found.
 */
export function componentSlugFromValue(
  categorySlug: string | null | undefined,
  value: string | null | undefined
): string {
  const cat = findCategory(categorySlug);
  if (!cat?.components || !value) return "";
  const v = value.trim().toLowerCase();
  for (const [slug, comp] of Object.entries(cat.components)) {
    const tag = comp.attributes.find(
      (a) => a.name === "data-cim-tile-component" || a.name === "data-cim-paint-component"
    );
    if (tag?.default && tag.default.trim().toLowerCase() === v) return slug;
  }
  return "";
}

/**
 * Required attributes for a category. A category may have base `attributes`
 * (shown by default) and optional `components`: when a component is chosen its
 * attributes REPLACE the base; with none chosen, the base attributes show.
 * Matched by slug (case-insensitive). Returns [] when nothing is configured.
 */
export function getRequiredAttributes(
  categorySlug: string | null | undefined,
  componentSlug?: string | null
): RequiredAttribute[] {
  const cat = findCategory(categorySlug);
  if (!cat) return [];
  // A chosen component replaces the base.
  if (cat.components && componentSlug) {
    const key = componentSlug.trim().toLowerCase();
    const comp = Object.entries(cat.components).find(
      ([slug]) => slug.toLowerCase() === key
    );
    if (comp) return comp[1].attributes;
  }
  // Otherwise the category's base attributes.
  return cat.attributes ?? [];
}
