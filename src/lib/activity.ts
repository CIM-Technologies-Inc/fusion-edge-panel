import { supabase } from "./supabase";

/** One change entry. For updates, `changes` is { field: { old, new } }. */
export type ActivityEntry = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete" | "attrs";
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
  /** Inclusive lower/upper bounds as ISO timestamps. */
  from?: string;
  to?: string;
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
  if (opts?.from) q = q.gte("created_at", opts.from);
  if (opts?.to) q = q.lte("created_at", opts.to);

  const { data, error } = await q;
  if (error) {
    // Before migration 0046 the table doesn't exist — treat as empty.
    if (/activity_log/i.test(error.message))
      return { entries: [], error: null };
    return { entries: [], error: error.message };
  }
  return { entries: (data as ActivityEntry[]) ?? [], error: null };
}

/**
 * A product's Specification set, for diffing: attribute name → the value names
 * it currently offers. Build this from the product's spec assignments before
 * and after a save, then call logSpecChanges to record what changed.
 */
export type SpecSnapshot = Record<string, string[]>;

/**
 * Compute added/removed values per attribute between two spec snapshots and,
 * if anything changed, write ONE activity-log entry for the product (via the
 * log_product_attr_change RPC). No-ops when nothing changed. Never throws into
 * the save flow — a logging failure is swallowed (returns the error for the
 * caller to optionally surface).
 */
export async function logSpecChanges(
  productId: string,
  productName: string,
  before: SpecSnapshot,
  after: SpecSnapshot
): Promise<{ error: string | null }> {
  // Store the FULL before and after value lists for any field that changed, so
  // the log can show a proper Before → After (not just what was added/removed).
  const diff: Record<string, { before: string[]; after: string[] }> = {};
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const name of names) {
    const b = before[name] ?? [];
    const a = after[name] ?? [];
    // Changed if the value sets differ (order-independent).
    const bSet = new Set(b);
    const aSet = new Set(a);
    const changed =
      b.length !== a.length ||
      [...bSet].some((v) => !aSet.has(v)) ||
      [...aSet].some((v) => !bSet.has(v));
    if (changed) diff[name] = { before: b, after: a };
  }
  if (Object.keys(diff).length === 0) return { error: null };

  const { error } = await supabase.rpc("log_product_attr_change", {
    pid: productId,
    label: productName,
    diff,
  });
  return { error: error?.message ?? null };
}

/**
 * Readable rows for an 'attrs' (field/spec change) entry: the full Before and
 * After value for each changed field. Supports both the current shape
 * ({ before, after }) and the older added/removed shape, for old log rows.
 */
export function describeSpecChange(
  entry: ActivityEntry
): { attribute: string; from: string; to: string }[] {
  const join = (arr: unknown): string =>
    Array.isArray(arr) && arr.length ? arr.map(String).join(", ") : "—";
  const rows: { attribute: string; from: string; to: string }[] = [];
  for (const [attribute, val] of Object.entries(entry.changes)) {
    if (!val || typeof val !== "object") continue;
    const v = val as {
      before?: unknown;
      after?: unknown;
      added?: unknown;
      removed?: unknown;
    };
    if ("before" in v || "after" in v) {
      rows.push({ attribute, from: join(v.before), to: join(v.after) });
    } else {
      // Legacy rows: reconstruct a best-effort label from added/removed.
      const added = Array.isArray(v.added) ? v.added.map(String) : [];
      const removed = Array.isArray(v.removed) ? v.removed.map(String) : [];
      rows.push({
        attribute,
        from: removed.length ? removed.join(", ") : "—",
        to: added.length ? added.join(", ") : "—",
      });
    }
  }
  return rows;
}

/** Fields not worth showing in the change list. */
const HIDDEN_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "position",
  "slug",
  // Product bookkeeping that only adds noise to a human-readable diff.
  "approved_snapshot",
  "search_vector",
  "supplier_id",
]);

/** Human labels for the raw column names. Anything not listed is prettified. */
const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  sku: "SKU",
  kind: "Type",
  price_cents: "Price",
  sale_price_cents: "Sale price",
  price_max_cents: "Max price",
  quantity: "Quantity",
  in_stock: "In stock",
  featured: "Featured",
  published: "Published",
  approval_status: "Approval status",
  rejection_reason: "Rejection reason",
  short_description: "Short description",
  description: "Description",
  model_3d_url: "3D model",
  category_id: "Category",
  brand_id: "Brand",
  company_id: "Company",
};

/** Columns stored in cents that should read as a peso amount. */
const CENTS_FIELDS = new Set([
  "price_cents",
  "sale_price_cents",
  "price_max_cents",
]);

/** Turn a raw column name into a readable label. */
export function fieldLabel(field: string): string {
  if (FIELD_LABEL[field]) return FIELD_LABEL[field];
  return field
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * A readable list of changes for an entry: { field, label, from, to }.
 * One entry = one save, so a save that touched 3 fields returns 3 rows.
 */
export function describeChanges(
  entry: ActivityEntry
): { field: string; label: string; from: string; to: string }[] {
  const fmt = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (CENTS_FIELDS.has(field) && typeof v === "number") {
      return `₱${(v / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    const s = String(v);
    // A reference id (category/brand/company) is a UUID — not human-readable,
    // so just mark that it was set rather than dumping the raw id.
    if (field.endsWith("_id") && /^[0-9a-f-]{36}$/i.test(s)) return "set";
    // Long HTML/description values aren't useful verbatim in a diff.
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  };
  const rows: { field: string; label: string; from: string; to: string }[] = [];
  for (const [field, val] of Object.entries(entry.changes)) {
    if (HIDDEN_FIELDS.has(field)) continue;
    if (
      val &&
      typeof val === "object" &&
      "old" in (val as Record<string, unknown>)
    ) {
      const o = val as { old: unknown; new: unknown };
      const from = fmt(field, o.old);
      const to = fmt(field, o.new);
      if (from === to) continue; // unchanged after formatting — skip
      rows.push({ field, label: fieldLabel(field), from, to });
    } else {
      // insert/delete: full value, no before.
      rows.push({ field, label: fieldLabel(field), from: "", to: fmt(field, val) });
    }
  }
  return rows;
}
