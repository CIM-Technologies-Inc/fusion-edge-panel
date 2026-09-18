import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Role = "admin" | "staff" | "supplier" | "customer" | null;

/** A "resource.action" permission key, e.g. "product.edit". */
export type Permission = string;

type ProfileInfo = {
  isAdmin: boolean;
  role: Role;
  companyId: string | null;
  permissions: Set<Permission>;
};

type AuthState = {
  session: Session | null;
  /** true once the admin flag has been read from `profiles`. */
  isAdmin: boolean;
  /** The signed-in user's legacy role enum, or null. */
  role: Role;
  /** Convenience: role === "supplier". */
  isSupplier: boolean;
  /** The user's company id (for data scoping), or null. */
  companyId: string | null;
  /** The user's granted permission keys ("resource.action"). */
  permissions: Set<Permission>;
  /**
   * Whether the user may do `action` on `resource`. Admins can do anything.
   * e.g. can("product", "edit").
   */
  can: (resource: string, action: string) => boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function readProfile(userId: string): Promise<ProfileInfo> {
  const empty: ProfileInfo = {
    isAdmin: false,
    role: null,
    companyId: null,
    permissions: new Set(),
  };

  // Profile with role + company. Falls back if the new columns aren't there.
  const withNew = await supabase
    .from("profiles")
    .select("is_admin, role, role_id, company_id")
    .eq("id", userId)
    .maybeSingle();

  let isAdmin = false;
  let role: Role = null;
  let roleId: string | null = null;
  let companyId: string | null = null;

  if (!withNew.error && withNew.data) {
    isAdmin = withNew.data.is_admin === true;
    role = (withNew.data.role as Role) ?? null;
    roleId = (withNew.data as { role_id?: string | null }).role_id ?? null;
    companyId = (withNew.data as { company_id?: string | null }).company_id ?? null;
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    isAdmin = data?.is_admin === true;
    return { ...empty, isAdmin };
  }

  // Load the role's permission keys (skip for admins — they bypass).
  const permissions = new Set<Permission>();
  if (roleId && !isAdmin) {
    const { data: perms } = await supabase
      .from("role_permissions")
      .select("resource, action")
      .eq("role_id", roleId);
    for (const p of perms ?? []) permissions.add(`${p.resource}.${p.action}`);
  }

  return { isAdmin, role, companyId, permissions };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function hydrate(next: Session | null) {
      if (!active) return;
      setSession(next);
      if (next?.user) {
        const p = await readProfile(next.user.id);
        setIsAdmin(p.isAdmin);
        setRole(p.role);
        setCompanyId(p.companyId);
        setPermissions(p.permissions);
      } else {
        setIsAdmin(false);
        setRole(null);
        setCompanyId(null);
        setPermissions(new Set());
      }
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      hydrate(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      isAdmin,
      role,
      isSupplier: role === "supplier",
      companyId,
      permissions,
      can: (resource: string, action: string) =>
        isAdmin || permissions.has(`${resource}.${action}`),
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, isAdmin, role, companyId, permissions, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
