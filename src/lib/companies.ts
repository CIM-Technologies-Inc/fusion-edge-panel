import { supabase } from "./supabase";
import { slugify } from "./products";
import type { CompanyFull } from "../types/catalogue";

export type CompanyInput = {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  position: number;
};

/**
 * A slug for a company, derived from its (unique) name. Kept unique with a
 * -1, -2… suffix as a safety net, though names are already unique.
 */
export function uniqueCompanySlug(
  name: string,
  existing: CompanyFull[],
  editingId?: string
): string {
  const base = slugify(name) || "company";
  const taken = new Set(
    existing.filter((c) => c.id !== editingId).map((c) => c.slug)
  );
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Mirrors the DB rules so the form can flag problems before the round-trip. */
export function validateCompany(
  input: CompanyInput,
  existing: CompanyFull[],
  editingId?: string
): string | null {
  if (!input.name.trim()) return "Name is required.";

  // The name is the unique identifier (case-insensitive); the slug is derived.
  const name = input.name.trim().toLowerCase();
  const clash = existing.some(
    (c) => c.name.trim().toLowerCase() === name && c.id !== editingId
  );
  if (clash) return "That company name is already used.";

  return null;
}

export async function createCompany(
  input: CompanyInput
): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase
    .from("companies")
    .insert(input)
    .select("id")
    .single();
  return { error: error?.message ?? null, id: data?.id ?? null };
}

export async function updateCompany(
  id: string,
  input: CompanyInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("companies").update(input).eq("id", id);
  return { error: error?.message ?? null };
}

/**
 * Delete a company. Its brands are NOT deleted — the FK is ON DELETE SET NULL,
 * so they simply lose their company.
 */
export async function deleteCompany(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("companies").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/** How many brands sit under a company (used to warn before deleting). */
export async function countCompanyBrands(id: string): Promise<number> {
  const { count } = await supabase
    .from("brand_companies")
    .select("brand_id", { count: "exact", head: true })
    .eq("company_id", id);
  return count ?? 0;
}

/**
 * Replace the set of brands assigned to a company.
 *
 * The join has no partial-update shape we need, so we clear this company's
 * links and re-insert the chosen ones. A brand may belong to several companies,
 * so we only ever touch rows for THIS company.
 */
export async function setCompanyBrands(
  companyId: string,
  brandIds: string[]
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from("brand_companies")
    .delete()
    .eq("company_id", companyId);
  if (delErr) return { error: delErr.message };

  if (brandIds.length === 0) return { error: null };

  const rows = brandIds.map((brand_id) => ({
    brand_id,
    company_id: companyId,
  }));
  const { error } = await supabase.from("brand_companies").insert(rows);
  return { error: error?.message ?? null };
}

export { slugify };
