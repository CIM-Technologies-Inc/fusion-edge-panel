import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ActivityLog from "../components/common/ActivityLog";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

type Filter = "all" | "companies" | "categories" | "products";

const dateInput =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:[color-scheme:dark]";

/** yyyy-mm-dd for a Date, in local time (matches <input type="date">). */
const isoDay = (d: Date) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export default function Activity() {
  const [filter, setFilter] = useState<Filter>("all");
  // Date range as yyyy-mm-dd (local). Empty = unbounded on that side.
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  // Turn the day strings into inclusive ISO timestamp bounds.
  const from = fromDay ? new Date(`${fromDay}T00:00:00`).toISOString() : undefined;
  const to = toDay ? new Date(`${toDay}T23:59:59.999`).toISOString() : undefined;

  const setPreset = (days: number) => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1));
    setFromDay(isoDay(start));
    setToDay(isoDay(now));
  };

  const clearDates = () => {
    setFromDay("");
    setToDay("");
  };

  return (
    <div>
      <PageMeta
        title="Activity log | FusionEdge"
        description="Recent changes to companies and categories"
      />
      <PageBreadcrumb pageTitle="Activity" />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex h-11 overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
            {(
              [
                { key: "all", label: "All" },
                { key: "products", label: "Products" },
                { key: "companies", label: "Companies" },
                { key: "categories", label: "Categories" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`px-4 text-sm font-medium transition ${
                  filter === opt.key
                    ? "bg-brand-500 text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDay}
              max={toDay || undefined}
              onChange={(e) => setFromDay(e.target.value)}
              aria-label="From date"
              className={dateInput}
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={toDay}
              min={fromDay || undefined}
              onChange={(e) => setToDay(e.target.value)}
              aria-label="To date"
              className={dateInput}
            />
          </div>

          {/* Quick presets */}
          <div className="inline-flex h-11 overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
            {[
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(p.days)}
                className="px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {p.label}
              </button>
            ))}
          </div>

          {(fromDay || toDay) && (
            <button
              type="button"
              onClick={clearDates}
              className="text-sm font-medium text-gray-500 hover:text-brand-500"
            >
              Clear dates
            </button>
          )}
        </div>

        <div className={shell}>
          <ActivityLog
            key={`${filter}|${from ?? ""}|${to ?? ""}`}
            table={filter === "all" ? undefined : filter}
            from={from}
            to={to}
            limit={100}
            showRecord
          />
        </div>
      </div>
    </div>
  );
}
