import { supabase } from "./supabase";
import { slugify } from "./products";
import type { CategoryFull } from "../types/catalogue";

export type CategoryInput = {
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  position: number;
};

/**
 * Auto-generate a slug from a name that doesn't collide with an existing one:
 * "foo", then "foo-1", "foo-2"… `editingId` is skipped so a category keeps its
 * own slug. Returns a lowercase, hyphenated, unique slug.
 */
export function uniqueCategorySlug(
  name: string,
  existing: CategoryFull[],
  editingId?: string
): string {
  const base = slugify(name) || "category";
  const taken = new Set(
    existing.filter((c) => c.id !== editingId).map((c) => c.slug)
  );
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Mirrors the DB rules so the form can flag problems before the round-trip. */
export function validateCategory(
  input: CategoryInput,
  existing: CategoryFull[],
  editingId?: string
): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.slug.trim()) return "Slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))
    return "Slug must be lowercase words separated by hyphens.";

  // slug is UNIQUE in the schema — catch the clash before Postgres does.
  const clash = existing.some(
    (c) => c.slug === input.slug && c.id !== editingId
  );
  if (clash) return "That slug is already used by another category.";

  // A category cannot be its own parent.
  if (editingId && input.parent_id === editingId)
    return "A category cannot be its own parent.";

  return null;
}

export async function createCategory(
  input: CategoryInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("categories").insert(input);
  return { error: error?.message ?? null };
}

export async function updateCategory(
  id: string,
  input: CategoryInput
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("categories")
    .update(input)
    .eq("id", id);
  return { error: error?.message ?? null };
}

/**
 * Delete a category. Products referencing it are NOT deleted — the FK is
 * ON DELETE SET NULL, so they simply become uncategorised. Child categories
 * likewise have their parent_id cleared.
 */
export async function deleteCategory(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/** How many products sit in a category (used to warn before deleting). */
export async function countCategoryProducts(id: string): Promise<number> {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  return count ?? 0;
}

export { slugify };
