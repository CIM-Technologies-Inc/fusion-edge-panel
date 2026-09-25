import { supabase } from "./supabase";

/** Resources and actions that make up the permission matrix. */
export const RESOURCES = [
  "product",
  "company",
  "brand",
  "category",
  "users",
  "role",
  "media",
  "approval",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["view", "add", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/** Approval is a special resource with its own actions (not view/add/…). */
export const APPROVAL_ACTIONS = ["approve", "reject"] as const;

/**
 * The standard grid actions for a resource. `product.feature` is an extra
 * action rendered as a separate toggle (not in the 4-column grid), and only for
 * non-company/staff roles.
 */
export const actionsFor = (resource: string): readonly string[] =>
  resource === "approval" ? APPROVAL_ACTIONS : ACTIONS;

export const RESOURCE_LABEL: Record<Resource, string> = {
  product: "Products",
  company: "Companies",
  brand: "Brands",
  category: "Categories",
  users: "Users",
  role: "Roles",
  media: "Media",
  approval: "Approvals",
};

/** A permission key, e.g. "product.edit" or "approval.approve". */
export type PermKey = `${string}.${string}`;

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** A company role hides global permissions (Categories, Users) in the matrix. */
  is_company: boolean;
};

export async function createRole(
  name: string,
  description: string | null,
  isCompany = false
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("roles")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      is_company: isCompany,
    })
    .select("id")
    .single();
  return { id: data?.id ?? null, error: error?.message ?? null };
}

export async function updateRole(
  id: string,
  name: string,
  description: string | null,
  isCompany?: boolean
): Promise<{ error: string | null }> {
  const patch: {
    name: string;
    description: string | null;
    is_company?: boolean;
  } = { name: name.trim(), description: description?.trim() || null };
  if (isCompany !== undefined) patch.is_company = isCompany;

  const { error } = await supabase.from("roles").update(patch).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteRole(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("roles").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/**
 * Persist a manual role order. `orderedIds` is the full list of role ids in the
 * desired order; each row's `position` is set to its index. Admin-only (RLS).
 */
export async function reorderRoles(
  orderedIds: string[]
): Promise<{ error: string | null }> {
  const updates = orderedIds.map((id, position) =>
    supabase.from("roles").update({ position }).eq("id", id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  return { error: failed?.error?.message ?? null };
}

/** How many users hold a role — to warn before deleting. */
export async function countRoleUsers(id: string): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id);
  return count ?? 0;
}

/**
 * How many users with THIS role also have a company assigned. Used to block
 * adding a company permission to a role whose users are tied to a company.
 */
export async function countRoleUsersWithCompany(id: string): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id)
    .not("company_id", "is", null);
  return count ?? 0;
}

/** Load a role's permissions as a set of "resource.action" keys. */
export async function getRolePermissions(
  roleId: string
): Promise<{ perms: Set<PermKey>; error: string | null }> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("resource, action")
    .eq("role_id", roleId);
  if (error) return { perms: new Set(), error: error.message };
  const perms = new Set<PermKey>(
    (data ?? []).map((r) => `${r.resource}.${r.action}` as PermKey)
  );
  return { perms, error: null };
}

/**
 * Replace a role's permissions with the given set. Deletes all, re-inserts the
 * chosen ones — simple and correct for a join with no other columns.
 */
export async function setRolePermissions(
  roleId: string,
  perms: Set<PermKey>
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);
  if (delErr) return { error: delErr.message };

  if (perms.size === 0) return { error: null };

  const rows = [...perms].map((key) => {
    const [resource, action] = key.split(".");
    return { role_id: roleId, resource, action };
  });
  const { error } = await supabase.from("role_permissions").insert(rows);
  return { error: error?.message ?? null };
}
