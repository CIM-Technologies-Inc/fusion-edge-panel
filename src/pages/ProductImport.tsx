import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import { useToast } from "../context/ToastContext";
import {
  buildImportPlan,
  applyImport,
  type ProductPlan,
} from "../lib/productImport";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function ProductImport() {
  const { notify } = useToast();
  const navigate = useNavigate();

  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ProductPlan[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);

  const counts = useMemo(() => {
    const p = plan ?? [];
    return {
      create: p.filter((x) => x.action === "create").length,
      update: p.filter((x) => x.action === "update").length,
      error: p.filter((x) => x.action === "error").length,
      total: p.length,
    };
  }, [plan]);

  const handleFile = async (file: File) => {
    setParsing(true);
    setPlan(null);
    setFileName(file.name);
    const text = await file.text();
    const { products, error } = await buildImportPlan(text);
    setParsing(false);
    if (error) {
      notify("error", "Couldn't read the file", error);
      return;
    }
    setPlan(products);
  };

  const handleConfirm = async () => {
    if (!plan) return;
    const applicable = plan.filter((p) => p.action !== "error");
    if (applicable.length === 0) {
      notify("info", "Nothing to import", "Every row has an error to fix first.");
      return;
    }
    setApplying(true);
    const res = await applyImport(plan);
    setApplying(false);
    notify(
      res.failed > 0 ? "error" : "success",
      "Import finished",
      `${res.created} created, ${res.updated} updated${
        res.failed > 0 ? `, ${res.failed} failed` : ""
      }.`
    );
    if (res.failed === 0) navigate("/product");
  };

  const reset = () => {
    setPlan(null);
    setFileName(null);
  };

  return (
    <div>
      <PageMeta title="Import products | FusionEdge" description="Import products from a CSV" />
      <PageBreadcrumb pageTitle="Import products" />

      <div className="space-y-5">
        {/* Step 1: choose a file */}
        {!plan && (
          <div className={shell}>
            <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              Upload a CSV
            </h3>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Use a file in the same format as <strong>Export CSV</strong> on the
              products page. Matched products (by ID or SKU) are updated;
              unmatched ones are created as drafts. Company, brand and category
              must already exist.
            </p>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">
              {parsing ? "Reading…" : "Choose CSV file"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}

        {/* Step 2: review */}
        {plan && (
          <>
            <div className={`${shell} flex flex-wrap items-center gap-4`}>
              <div className="flex-1 min-w-40">
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {fileName}
                </p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {counts.total} row{counts.total === 1 ? "" : "s"} · review
                  before importing
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="sm" color="success">
                  {counts.create} to create
                </Badge>
                <Badge size="sm" color="info">
                  {counts.update} to update
                </Badge>
                {counts.error > 0 && (
                  <Badge size="sm" color="error">
                    {counts.error} error{counts.error === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
            </div>

            <div className={`${shell} overflow-x-auto p-0`}>
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">Line</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Company / Brand</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Variations</th>
                    <th className="px-5 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {plan.map((p, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 text-gray-400">{p.line}</td>
                      <td className="px-5 py-3">
                        {p.action === "create" ? (
                          <Badge size="sm" color="success">Create</Badge>
                        ) : p.action === "update" ? (
                          <Badge size="sm" color="info">Update</Badge>
                        ) : (
                          <Badge size="sm" color="error">Error</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800 dark:text-white/90">
                        {p.name || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400 capitalize">
                        {p.kind}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {p.companyName || "—"}
                        {p.brandName ? ` / ${p.brandName}` : ""}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {p.categoryName || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {p.variations.length || "—"}
                      </td>
                      <td className="px-5 py-3 text-theme-xs text-error-500">
                        {p.errors.join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={reset}
                className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Choose another file
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={applying || counts.create + counts.update === 0}
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {applying
                  ? "Importing…"
                  : `Confirm import (${counts.create + counts.update})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
