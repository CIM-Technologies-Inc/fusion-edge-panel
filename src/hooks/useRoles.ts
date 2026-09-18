import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type Role = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_company: boolean;
};

/** All roles (from the roles table), for pickers and the permissions page. */
export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  // role_id -> set of resources the role has ANY permission on.
  const [roleResources, setRoleResources] = useState<Map<string, Set<string>>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rolesRes, permsRes] = await Promise.all([
      supabase
        .from("roles")
        // System roles (Super Admin) first, then the rest alphabetically.
        .select("id, name, description, is_system, is_company")
        .order("is_system", { ascending: false })
        .order("name"),
      supabase.from("role_permissions").select("role_id, resource"),
    ]);
    setRoles((rolesRes.data as Role[]) ?? []);

    const map = new Map<string, Set<string>>();
    for (const p of permsRes.data ?? []) {
      const rid = (p as { role_id: string }).role_id;
      const res = (p as { resource: string }).resource;
      const set = map.get(rid) ?? new Set<string>();
      set.add(res);
      map.set(rid, set);
    }
    setRoleResources(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Does the role have any permission on the given resource? */
  const roleHasResource = useCallback(
    (roleId: string, resource: string) =>
      roleResources.get(roleId)?.has(resource) ?? false,
    [roleResources]
  );

  return { roles, roleResources, roleHasResource, loading, reload: load };
}
