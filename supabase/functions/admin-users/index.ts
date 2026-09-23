// ============================================================================
// admin-users — privileged user-management actions.
//
// Creating, inviting, deleting and banning users requires Supabase's admin API,
// which needs the SERVICE-ROLE key. That key must NEVER ship in the browser, so
// those actions live here in an Edge Function instead.
//
// Security model:
//   1. The caller sends their normal user access token (Authorization header).
//   2. We verify that token and confirm the caller's profile role = 'admin'
//      using an ANON client (subject to RLS) — a non-admin gets rejected.
//   3. Only then do we use the SERVICE-ROLE client to perform the action.
//
// Deploy: see DEPLOY.md next to this file.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Prefer secrets you set explicitly (ADMIN_FN_ANON_KEY / ADMIN_FN_SERVICE_KEY),
// falling back to Supabase's auto-injected keys. Setting your own avoids the
// "Invalid API key" issue on projects using the newer publishable/secret keys.
const ANON_KEY =
  Deno.env.get("ADMIN_FN_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY =
  Deno.env.get("ADMIN_FN_SERVICE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | { type: "create"; email: string; password?: string; full_name?: string; role?: string; role_id?: string; company_id?: string }
  | { type: "invite"; email: string; role?: string; full_name?: string; role_id?: string; company_id?: string; redirect_to?: string }
  | { type: "delete"; user_id: string }
  | { type: "setRole"; user_id: string; role: "admin" | "staff" | "supplier" | "customer" }
  | { type: "setBanned"; user_id: string; banned: boolean };

const ROLES = ["admin", "staff", "supplier", "customer"] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Fail clearly (WITH cors headers) if the service-role secret is missing,
  // instead of crashing later and returning a header-less CORS error.
  if (!SERVICE_ROLE_KEY) {
    return json(
      { error: "Server not configured: SERVICE_ROLE_KEY secret is missing." },
      500
    );
  }

  // --- 1 & 2: authenticate the caller and require admin ---------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Missing bearer token" }, 401);

  // Anon client bound to the caller's token — RLS applies, so this reflects
  // exactly what the caller is allowed to see.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);

  const { data: profile } = await asCaller
    .from("profiles")
    .select("role, is_admin, company_id, role_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const isAdminCaller = profile?.is_admin === true || profile?.role === "admin";
  const callerCompany = (profile?.company_id as string | null) ?? null;

  // A non-admin may manage users only if their role grants a users permission
  // AND they belong to a company — and then only within that company.
  let callerUserPerms: Set<string> = new Set();
  if (!isAdminCaller && profile?.role_id && callerCompany) {
    const { data: perms } = await asCaller
      .from("role_permissions")
      .select("action")
      .eq("role_id", profile.role_id)
      .eq("resource", "users");
    callerUserPerms = new Set((perms ?? []).map((p) => p.action as string));
  }
  const companyScoped = !isAdminCaller;

  if (!isAdminCaller && (callerUserPerms.size === 0 || !callerCompany)) {
    return json({ error: "Not permitted to manage users" }, 403);
  }

  // Uses the SERVICE-ROLE client to read a target user's company/admin flag,
  // so a company caller can be blocked from touching users outside their scope.
  async function assertTargetInScope(
    admin: ReturnType<typeof createClient>,
    targetId: string
  ): Promise<{ ok: true } | { ok: false; msg: string }> {
    if (isAdminCaller) return { ok: true };
    const { data: t } = await admin
      .from("profiles")
      .select("company_id, is_admin")
      .eq("id", targetId)
      .maybeSingle();
    if (!t) return { ok: false, msg: "User not found" };
    if (t.is_admin) return { ok: false, msg: "Can't manage an admin" };
    if ((t.company_id ?? null) !== callerCompany)
      return { ok: false, msg: "That user isn't in your company" };
    return { ok: true };
  }

  function requirePerm(action: string): boolean {
    return isAdminCaller || callerUserPerms.has(action);
  }

  // --- parse the requested action -------------------------------------------
  let action: Action;
  try {
    action = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // --- 3: perform it with the service-role client ---------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (action.type) {
      case "create": {
        if (!action.email) return json({ error: "email is required" }, 400);
        if (!requirePerm("add"))
          return json({ error: "Not permitted to add users" }, 403);
        const { data, error } = await admin.auth.admin.createUser({
          email: action.email,
          password: action.password || undefined,
          email_confirm: !!action.password, // password set => confirmed; else invite-style
          user_metadata: { full_name: action.full_name ?? null },
        });
        if (error) return json({ error: error.message }, 400);
        // Ensure a profile row and its role (a DB trigger may also create one).
        // A company caller can only create users in their OWN company, never
        // as admins.
        await applyProfile(admin, data.user!.id, {
          full_name: action.full_name,
          role: companyScoped ? undefined : action.role,
          role_id: action.role_id,
          company_id: companyScoped ? callerCompany! : action.company_id,
          invited_by: userData.user.id,
        });
        return json({ ok: true, user_id: data.user!.id });
      }

      case "invite": {
        if (!action.email) return json({ error: "email is required" }, 400);
        if (!requirePerm("add"))
          return json({ error: "Not permitted to add users" }, 403);
        // redirectTo sends the invite link to the app's set-password page;
        // the full name is stored so their profile is named from the start.
        const { data, error } = await admin.auth.admin.inviteUserByEmail(
          action.email,
          {
            ...(action.redirect_to ? { redirectTo: action.redirect_to } : {}),
            data: { full_name: action.full_name ?? null },
          }
        );
        if (error) return json({ error: error.message }, 400);
        await applyProfile(admin, data.user!.id, {
          full_name: action.full_name,
          role: companyScoped ? undefined : action.role,
          role_id: action.role_id,
          company_id: companyScoped ? callerCompany! : action.company_id,
          invited_by: userData.user.id,
        });
        return json({ ok: true, user_id: data.user!.id });
      }

      case "delete": {
        if (!action.user_id) return json({ error: "user_id is required" }, 400);
        if (action.user_id === userData.user.id)
          return json({ error: "You can't delete your own account." }, 400);
        if (!requirePerm("delete"))
          return json({ error: "Not permitted to delete users" }, 403);
        const scope = await assertTargetInScope(admin, action.user_id);
        if (!scope.ok) return json({ error: scope.msg }, 403);
        const { error } = await admin.auth.admin.deleteUser(action.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "setRole": {
        // Changing the legacy role enum (incl. admin) stays admin-only.
        if (!isAdminCaller)
          return json({ error: "Admin privileges required" }, 403);
        if (!ROLES.includes(action.role))
          return json({ error: "Invalid role" }, 400);
        if (action.user_id === userData.user.id && action.role !== "admin")
          return json({ error: "You can't remove your own admin role." }, 400);
        const { error } = await admin
          .from("profiles")
          .update({ role: action.role })
          .eq("id", action.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "setBanned": {
        if (action.user_id === userData.user.id)
          return json({ error: "You can't ban your own account." }, 400);
        if (!requirePerm("edit"))
          return json({ error: "Not permitted to change users" }, 403);
        const scope = await assertTargetInScope(admin, action.user_id);
        if (!scope.ok) return json({ error: scope.msg }, 403);
        // Ban at the auth level (blocks sign-in) and mark the profile.
        const { error: authErr } = await admin.auth.admin.updateUserById(
          action.user_id,
          // A far-future ban duration = effectively disabled; "none" lifts it.
          { ban_duration: action.banned ? "876000h" : "none" }
        );
        if (authErr) return json({ error: authErr.message }, 400);
        const { error } = await admin
          .from("profiles")
          .update({ banned_at: action.banned ? new Date().toISOString() : null })
          .eq("id", action.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/** Upsert the profile row's editable fields with the service role. */
async function applyProfile(
  admin: ReturnType<typeof createClient>,
  userId: string,
  fields: {
    full_name?: string | null;
    role?: string;
    role_id?: string;
    company_id?: string;
    invited_by?: string;
  }
) {
  const patch: Record<string, unknown> = {};
  if (fields.full_name !== undefined) patch.full_name = fields.full_name;
  if (fields.role && ROLES.includes(fields.role as (typeof ROLES)[number]))
    patch.role = fields.role;
  if (fields.role_id) patch.role_id = fields.role_id;
  if (fields.company_id) patch.company_id = fields.company_id;
  if (fields.invited_by) patch.invited_by = fields.invited_by;
  if (Object.keys(patch).length === 0) return;

  // Row may not exist yet if no signup trigger — upsert to be safe.
  await admin.from("profiles").upsert({ id: userId, ...patch });
}
