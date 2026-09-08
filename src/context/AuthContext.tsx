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

type AuthState = {
  session: Session | null;
  /** true once the admin flag has been read from `profiles`. */
  isAdmin: boolean;
  /** The signed-in user's role, or null when signed out / not yet loaded. */
  role: Role;
  /** Convenience: role === "supplier". */
  isSupplier: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function readProfile(
  userId: string
): Promise<{ isAdmin: boolean; role: Role }> {
  // Prefer role; fall back to is_admin only if the role column isn't there yet.
  const withRole = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", userId)
    .maybeSingle();
  if (!withRole.error && withRole.data) {
    return {
      isAdmin: withRole.data.is_admin === true,
      role: (withRole.data.role as Role) ?? null,
    };
  }
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return { isAdmin: data?.is_admin === true, role: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<Role>(null);
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
      } else {
        setIsAdmin(false);
        setRole(null);
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
    [session, isAdmin, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
