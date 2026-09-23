import { supabase } from "./supabase";

/** One change entry. For updates, `changes` is { field: { old, new } }. */
export type ActivityEntry = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  changes: Record<string, unknown>;
  record_label: string | null;
  actor_email: string | null;
  created_at: string;
};

/**
 * Recent activity. Pass `table`/`recordId` to scope to one item, or neither
 * for the global feed. RLS limits rows to what the caller may see.
 */
export async function loadActivity(opts?: {
  table?: string;
  recordId?: string;
  limit?: number;
}): Promise<{ entries: ActivityEntry[]; error: string | null }> {
  let q = supabase
    .from("activity_log")
    .select(
      "id, table_name, record_id, action, changes, record_label, actor_email, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);

  if (opts?.table) q = q.eq("table_name", opts.table);
  if (opts?.recordId) q = q.eq("record_id", opts.recordId);

  const { data, error } = await q;
  if (error) {
    // Before migration 0046 the table doesn't exist — treat as empty.
    if (/activity_log/i.test(error.message))
      return { entries: [], error: null };
    return { entries: [], error: error.message };
  }
  return { entries: (data as ActivityEntry[]) ?? [], error: null };
}

/** Fields not worth showing in the change list. */
const HIDDEN_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "position",
  "slug",
]);

/** A readable list of "field: old → new" (or "field: value") for an entry. */
export function describeChanges(
  entry: ActivityEntry
): { field: string; from: string; to: string }[] {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };
  const rows: { field: string; from: string; to: string }[] = [];
  for (const [field, val] of Object.entries(entry.changes)) {
    if (HIDDEN_FIELDS.has(field)) continue;
    if (
      val &&
      typeof val === "object" &&
      "old" in (val as Record<string, unknown>)
    ) {
      const o = val as { old: unknown; new: unknown };
      rows.push({ field, from: fmt(o.old), to: fmt(o.new) });
    } else {
      // insert/delete: full value, no before.
      rows.push({ field, from: "", to: fmt(val) });
    }
  }
  return rows;
}
