import { supabase } from "./supabase";

export type UserRole = "admin" | "staff" | "supplier" | "customer";

/** A row from the admin-only `admin_users` view (profiles + email). */
export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_admin: boolean;
  banned_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  staff: "Staff",
  supplier: "Supplier",
  customer: "Customer",
};

/**
 * List every user. Reads the admin_users view, which joins profiles with the
 * auth email and returns rows ONLY to admins (a non-admin gets an empty list).
 */
export async function listUsers(): Promise<{
  users: AdminUser[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      "id, email, full_name, avatar_url, role, is_admin, banned_at, created_at, last_sign_in_at"
    )
    .order("created_at", { ascending: false });
  if (error) return { users: [], error: error.message };
  return { users: (data as AdminUser[]) ?? [], error: null };
}

/**
 * Update a user's editable PROFILE fields (name / avatar). This goes straight
 * through the admin's RLS-checked session — no Edge Function needed, because
 * "update own profile" plus is_admin() lets an admin edit these columns.
 */
export async function updateUserProfile(
  userId: string,
  fields: { full_name?: string | null; avatar_url?: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Privileged actions — routed through the admin-users Edge Function because
// they need the service-role key (create/invite/delete) or are frozen against
// self-service by the profiles trigger (setRole/setBanned).
// ---------------------------------------------------------------------------

type AdminAction =
  | { type: "create"; email: string; password?: string; full_name?: string; role?: UserRole }
  | { type: "invite"; email: string; role?: UserRole; full_name?: string; redirect_to?: string }
  | { type: "delete"; user_id: string }
  | { type: "setRole"; user_id: string; role: UserRole }
  | { type: "setBanned"; user_id: string; banned: boolean };

async function callAdmin(
  action: AdminAction
): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: action,
  });
  if (error) {
    // functions.invoke surfaces the HTTP error; try to read the JSON message.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.json())?.error ?? message;
    } catch {
      /* keep the default */
    }
    return { data: null, error: message };
  }
  if (data && typeof data === "object" && "error" in data) {
    return { data: null, error: String((data as { error: unknown }).error) };
  }
  return { data, error: null };
}

export const createUser = (
  email: string,
  opts: { password?: string; full_name?: string; role?: UserRole } = {}
) => callAdmin({ type: "create", email, ...opts });

export const inviteUser = (
  email: string,
  role?: UserRole,
  full_name?: string
) =>
  callAdmin({
    type: "invite",
    email,
    role,
    full_name,
    // Send the invite link to this app's set-password page.
    redirect_to:
      typeof window !== "undefined"
        ? `${window.location.origin}/set-password`
        : undefined,
  });

export const deleteUser = (userId: string) =>
  callAdmin({ type: "delete", user_id: userId });

export const setUserRole = (userId: string, role: UserRole) =>
  callAdmin({ type: "setRole", user_id: userId, role });

export const setUserBanned = (userId: string, banned: boolean) =>
  callAdmin({ type: "setBanned", user_id: userId, banned });
