import type { SortDir } from "../../hooks/useTableControls";

const control =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

type ToolbarProps = {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  sortKey: string;
  onSortKey: (v: string) => void;
  sortOptions: { value: string; label: string }[];
  dir: SortDir;
  onToggleDir: () => void;
  /** Right-hand summary, e.g. "3 of 11". */
  summary: string;
  /** Extra controls rendered inline with the search bar (e.g. filters). */
  filters?: React.ReactNode;
};

export function ListToolbar({
  query,
  onQuery,
  placeholder,
  sortKey,
  onSortKey,
  sortOptions,
  dir,
  onToggleDir,
  summary,
  filters,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className={`${control} col-span-2 w-full placeholder:text-gray-400 dark:placeholder:text-white/30 sm:w-72`}
        />
        <div className="col-span-2 flex sm:col-auto">
          <select
            value={sortKey}
            onChange={(e) => onSortKey(e.target.value)}
            aria-label="Sort by"
            className={`${control} w-full rounded-r-none dark:bg-gray-900 sm:w-auto`}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onToggleDir}
            aria-label={`Sort ${dir === "asc" ? "ascending" : "descending"}`}
            title={dir === "asc" ? "Ascending" : "Descending"}
            className="h-11 shrink-0 rounded-r-lg border border-l-0 border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {dir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
        {filters}
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{summary}</span>
    </div>
  );
}

type PagerProps = {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
};

export function Pager({ page, pageCount, onPage }: PagerProps) {
  if (pageCount <= 1) return null;

  const btn =
    "h-9 min-w-9 rounded-lg border px-3 text-sm font-medium transition disabled:opacity-40";
  const idle = `${btn} border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]`;

  // Show a small window of pages around the current one.
  const pages: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pageCount, from + 4);
  for (let i = from; i <= to; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        className={idle}
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page}
          className={
            p === page
              ? `${btn} border-brand-500 bg-brand-500 text-white`
              : idle
          }
          onClick={() => onPage(p)}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        className={idle}
        disabled={page === pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
