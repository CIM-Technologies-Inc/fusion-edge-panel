import config from "../config/requiredAttributes.json";

export type RequiredAttribute = {
  /** Attribute slug/name, e.g. "data-cim-tile-h". */
  name: string;
  /** Human-readable label shown on the form. */
  label: string;
  /** Input kind for the form field. */
  type: "text" | "number" | "url" | "color" | "image";
  required: boolean;
  /** Value to pre-fill the field with when empty. Optional. */
  default?: string;
};

type CategoryConfig = {
  label: string;
  attributes: RequiredAttribute[];
};

const categories = (config as { categories: Record<string, CategoryConfig> })
  .categories;

/**
 * Required attributes configured for a category, matched by slug
 * (case-insensitive). Returns [] when the category has no config.
 */
export function getRequiredAttributes(
  categorySlug: string | null | undefined
): RequiredAttribute[] {
  if (!categorySlug) return [];
  const key = categorySlug.trim().toLowerCase();
  const found = Object.entries(categories).find(
    ([slug]) => slug.toLowerCase() === key
  );
  return found ? found[1].attributes : [];
}
