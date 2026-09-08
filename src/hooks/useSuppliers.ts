import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type SupplierOption = {
  id: string;
  name: string;
};

/**
 * Suppliers (profiles with role='supplier'), for the admin's product-owner
 * dropdown. Reads the admin-only admin_users view, so a non-admin gets none.
 */
export function useSuppliers(enabled: boolean) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    supabase
      .from("admin_users")
      .select("id, full_name, email, role")
      .eq("role", "supplier")
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []).map((u) => ({
          id: u.id as string,
          name: (u.full_name as string) || (u.email as string) || "Supplier",
        }));
        setSuppliers(rows);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { suppliers };
}
