import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { centsToInput } from "../lib/price";
import {
  loadBulkProducts,
  saveBulkPrices,
  type BulkProduct,
  type PriceEdit,
} from "../lib/bulkPrices";

const shell =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const cellInput =
  "h-9 w-28 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 disabled:cursor-not-allowed dark:border-gray-700 dark:text-white/90";

/** Edits are keyed by row id. Product rows and variation rows are separate. */
type Edits = Record<string, PriceEdit>;

export default function BulkPrices() {
  const { notify } = useToast();
  const { isSupplier, isAdmin, companyId, session, can } = useAuth();
  // Bulk price editing requires the pricing permission (admins bypass).
  const canPrice = can("product", "price");

  const [products, setProducts] = useState<BulkProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // Original values (for "changed?" checks) and pending edits.
  const [productEdits, setProductEdits] = useState<Edits>({});
  const [variationEdits, setVariationEdits] = useState<Edits>({});

  const load = async () => {
    setLoading(true);
    // Admins: all products. Company-users: only their own company's (RLS also
    // enforces this on save). Legacy suppliers: only their own rows.
    const { products, error } = await loadBulkProducts(
      isAdmin ? null : companyId
    );
    const scoped =
      isSupplier && session?.user
        ? products.filter((p) => p.supplier_id === session.user.id)
        : products;
    setProducts(scoped);
    setError(error);
    setProductEdits({});
    setVariationEdits({});
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupplier, isAdmin, companyId, session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        p.variations.some((v) => (v.sku ?? "").toLowerCase().includes(q))
    );
  }, [products, query]);

  const changedCount =
    Object.keys(productEdits).length + Object.keys(variationEdits).length;

  // The current value of a field: the edit if present, else the original.
  const productVal = (p: BulkProduct, field: "price" | "sale") =>
    productEdits[p.id]?.[field] ??
    centsToInput(field === "price" ? p.price_cents : p.sale_price_cents);

  const setProduct = (
    p: BulkProduct,
    field: "price" | "sale",
    value: string
  ) => {
    const original = centsToInput(
      field === "price" ? p.price_cents : p.sale_price_cents
    );
    setProductEdits((prev) => {
      const next = { ...prev };
      const row = { ...next[p.id] };
      if (value === original) delete row[field];
      else row[field] = value;
      if (Object.keys(row).length === 0) delete next[p.id];
      else next[p.id] = row;
      return next;
    });
  };

  const varVal = (
    vId: string,
    orig: number | null,
    field: "price" | "sale"
  ) => variationEdits[vId]?.[field] ?? centsToInput(orig);

  const setVar = (
    vId: string,
    orig: number | null,
    field: "price" | "sale",
    value: string
  ) => {
    const original = centsToInput(orig);
    setVariationEdits((prev) => {
      const next = { ...prev };
      const row = { ...next[vId] };
      if (value === original) delete row[field];
      else row[field] = value;
      if (Object.keys(row).length === 0) delete next[vId];
      else next[vId] = row;
      return next;
    });
  };

  const handleSave = async () => {
    if (changedCount === 0) return;
    setSaving(true);
    const { error, saved } = await saveBulkPrices(productEdits, variationEdits);
    setSaving(false);
    if (error) {
      notify("error", "Save failed", error);
      return;
    }
    notify("success", "Prices updated", `${saved} row${saved === 1 ? "" : "s"} saved.`);
    load();
  };

  return (
    <div>
      <PageMeta title="Bulk prices | FusionEdge" description="Edit product and variation prices in bulk" />
      <PageBreadcrumb pageTitle="Bulk prices" />

      <div className="space-y-4">
        {!canPrice && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
            View only — you need the pricing permission to change prices here.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or SKU"
            className="h-11 w-64 max-w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:text-white/90"
          />
          {canPrice && (
            <>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {changedCount > 0
                  ? `${changedCount} unsaved change${
                      changedCount === 1 ? "" : "s"
                    }`
                  : "No changes"}
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || changedCount === 0}
                className="h-11 ml-auto rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className={`${shell} p-6`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : error ? (
          <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${shell} p-6 text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No products found.
            </p>
          </div>
        ) : (
          <div className={`${shell} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Product / Variation</th>
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Price (₱)</th>
                  <th className="px-5 py-3 font-medium">Sale (₱)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) =>
                  p.kind === "variable" ? (
                    // Variable: a header row + editable variation sub-rows.
                    <RowGroup key={p.id}>
                      <tr className="border-b border-gray-50 bg-gray-50/60 dark:border-gray-800/60 dark:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                            {p.name}
                            <Badge size="sm" color="info">
                              variable
                            </Badge>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400">{p.sku ?? "—"}</td>
                        <td className="px-5 py-3 text-theme-xs text-gray-400" colSpan={2}>
                          Set per variation below
                        </td>
                      </tr>
                      {p.variations.length === 0 ? (
                        <tr className="border-b border-gray-50 dark:border-gray-800/60">
                          <td className="px-5 py-3 pl-10 text-theme-xs text-gray-400" colSpan={4}>
                            No variations yet.
                          </td>
                        </tr>
                      ) : (
                        p.variations.map((v) => {
                          const changed = !!variationEdits[v.id];
                          return (
                            <tr
                              key={v.id}
                              className={`border-b border-gray-50 last:border-0 dark:border-gray-800/60 ${
                                changed ? "bg-brand-50/40 dark:bg-brand-500/[0.06]" : ""
                              }`}
                            >
                              <td className="px-5 py-2.5 pl-10 text-gray-600 dark:text-gray-300">
                                {v.label}
                              </td>
                              <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400">
                                {v.sku ?? "—"}
                              </td>
                              <td className="px-5 py-2.5">
                                <input
                                  type="number"
                                  step={0.01}
                                  className={cellInput}
                                  disabled={!canPrice}
                                  value={varVal(v.id, v.price_cents, "price")}
                                  onChange={(e) =>
                                    setVar(v.id, v.price_cents, "price", e.target.value)
                                  }
                                />
                              </td>
                              <td className="px-5 py-2.5">
                                <input
                                  type="number"
                                  step={0.01}
                                  className={cellInput}
                                  disabled={!canPrice}
                                  placeholder="—"
                                  value={varVal(v.id, v.sale_price_cents, "sale")}
                                  onChange={(e) =>
                                    setVar(v.id, v.sale_price_cents, "sale", e.target.value)
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </RowGroup>
                  ) : (
                    // Simple: one editable row.
                    <tr
                      key={p.id}
                      className={`border-b border-gray-50 last:border-0 dark:border-gray-800/60 ${
                        productEdits[p.id] ? "bg-brand-50/40 dark:bg-brand-500/[0.06]" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                          {p.name}
                          <Badge size="sm" color="light">
                            simple
                          </Badge>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {p.sku ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step={0.01}
                          className={cellInput}
                                  disabled={!canPrice}
                          value={productVal(p, "price")}
                          onChange={(e) => setProduct(p, "price", e.target.value)}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step={0.01}
                          className={cellInput}
                                  disabled={!canPrice}
                          placeholder="—"
                          value={productVal(p, "sale")}
                          onChange={(e) => setProduct(p, "sale", e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Group wrapper so a variable product's rows share a React key parent. */
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
