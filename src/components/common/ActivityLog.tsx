import { useCallback, useEffect, useState } from "react";
import {
  describeChanges,
  loadActivity,
  type ActivityEntry,
} from "../../lib/activity";

const RESOURCE_LABEL: Record<string, string> = {
  companies: "Company",
  categories: "Category",
  products: "Product",
};

const actionWord: Record<string, string> = {
  insert: "created",
  update: "updated",
  delete: "deleted",
};

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

type Props = {
  /** Scope to one record; omit for a global feed. */
  table?: string;
  recordId?: string;
  limit?: number;
  /** Show the record name/type per entry (useful on the global feed). */
  showRecord?: boolean;
};

/** Renders recent activity entries with who / what / before → after. */
export default function ActivityLog({
  table,
  recordId,
  limit,
  showRecord,
}: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { entries } = await loadActivity({ table, recordId, limit });
    setEntries(entries);
    setLoading(false);
  }, [table, recordId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {entries.map((e) => {
        const rows = describeChanges(e);
        return (
          <li
            key={e.id}
            className="relative pl-5 border-l border-gray-200 dark:border-gray-800"
          >
            <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <div className="text-sm text-gray-800 dark:text-white/90">
              <span className="font-medium">
                {e.actor_email ?? "Someone"}
              </span>{" "}
              {actionWord[e.action] ?? e.action}
              {showRecord && (
                <>
                  {" "}
                  {RESOURCE_LABEL[e.table_name] ?? e.table_name}{" "}
                  <span className="font-medium">
                    {e.record_label ?? "—"}
                  </span>
                </>
              )}
              {!showRecord && e.record_label && (
                <> “{e.record_label}”</>
              )}
            </div>
            <div className="text-theme-xs text-gray-400">
              {timeAgo(e.created_at)}
            </div>

            {e.action === "update" && rows.length > 0 && (
              <ul className="mt-2 space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.field}
                    className="text-theme-xs text-gray-600 dark:text-gray-300"
                  >
                    <span className="text-gray-400">{r.field}:</span>{" "}
                    <span className="line-through text-gray-400">{r.from}</span>{" "}
                    → <span className="font-medium">{r.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
