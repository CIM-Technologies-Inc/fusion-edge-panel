import ActivityLog from "./ActivityLog";

type Props = {
  /** Open when a record is set; null closes the drawer. */
  table: string;
  recordId: string | null;
  /** Shown under the "Activity" title (e.g. the record's name). */
  title?: string;
  onClose: () => void;
  limit?: number;
};

/** A right-side, scrollable drawer showing a record's change history. */
export default function ActivityDrawer({
  table,
  recordId,
  title,
  onClose,
  limit = 50,
}: Props) {
  if (!recordId) return null;
  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-[99999] bg-gray-900/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* panel */}
      <aside
        className="fixed right-0 top-0 z-[100000] flex h-screen w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        role="dialog"
        aria-label="Activity"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Activity
            </h3>
            {title && (
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {title}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ActivityLog table={table} recordId={recordId} limit={limit} />
        </div>
      </aside>
    </>
  );
}
