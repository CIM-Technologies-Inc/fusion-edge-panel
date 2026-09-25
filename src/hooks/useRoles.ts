import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type Role = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_company: boolean;
  position?: number | null;
};

/** All roles (from the roles table), for pickers and the permissions page. */
export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  // role_id -> set of resources the role has ANY permission on.
  const [roleResources, setRoleResources] = useState<Map<string, Set<string>>>(
    new Map()
  );
  // role_id -> sorted list of "resource.action" permission keys.
  const [rolePerms, setRolePerms] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rolesRes, permsRes] = await Promise.all([
      supabase
        .from("roles")
        // Manual order first (position), falling back to name for ties/nulls.
        .select("id, name, description, is_system, is_company, position")
        .order("position", { ascending: true, nullsFirst: false })
        .order("name"),
      supabase.from("role_permissions").select("role_id, resource, action"),
    ]);
    setRoles((rolesRes.data as Role[]) ?? []);

    const map = new Map<string, Set<string>>();
    const permMap = new Map<string, string[]>();
    for (const p of permsRes.data ?? []) {
      const rid = (p as { role_id: string }).role_id;
      const res = (p as { resource: string }).resource;
      const act = (p as { action: string }).action;
      const set = map.get(rid) ?? new Set<string>();
      set.add(res);
      map.set(rid, set);
      const list = permMap.get(rid) ?? [];
      list.push(`${res}.${act}`);
      permMap.set(rid, list);
    }
    for (const [k, v] of permMap) permMap.set(k, v.sort());
    setRoleResources(map);
    setRolePerms(permMap);
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

  return {
    roles,
    roleResources,
    rolePerms,
    roleHasResource,
    loading,
    reload: load,
  };
}
