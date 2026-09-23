import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ActivityLog from "../components/common/ActivityLog";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

type Filter = "all" | "companies" | "categories" | "products";

export default function Activity() {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div>
      <PageMeta
        title="Activity log | FusionEdge"
        description="Recent changes to companies and categories"
      />
      <PageBreadcrumb pageTitle="Activity" />

      <div className="space-y-5">
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

        <div className={shell}>
          <ActivityLog
            key={filter}
            table={filter === "all" ? undefined : filter}
            limit={100}
            showRecord
          />
        </div>
      </div>
    </div>
  );
}
