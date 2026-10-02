import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  loadBulkInventory,
  saveBulkInventory,
  type BulkInvProduct,
  type QtyEdit,
} from "../lib/bulkInventory";

const shell =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const cellInput =
  "h-9 w-24 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 disabled:cursor-not-allowed dark:border-gray-700 dark:text-white/90";

type Edits = Record<string, QtyEdit>;

export default function BulkInventory() {
  const { notify } = useToast();
  const { isAdmin, companyId, can } = useAuth();
  // Bulk inventory editing requires the stock permission (admins bypass).
  const canStock = can("product", "stock");

  const [products, setProducts] = useState<BulkInvProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [productEdits, setProductEdits] = useState<Edits>({});
  const [variationEdits, setVariationEdits] = useState<Edits>({});

  const load = async () => {
    setLoading(true);
    const { products, error } = await loadBulkInventory(
      isAdmin ? null : companyId
    );
    setProducts(products);
    setError(error);
    setProductEdits({});
    setVariationEdits({});
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, companyId]);

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

  const productVal = (p: BulkInvProduct) =>
    productEdits[p.id]?.quantity ?? String(p.quantity);

  const setProduct = (p: BulkInvProduct, value: string) => {
    const original = String(p.quantity);
    setProductEdits((prev) => {
      const next = { ...prev };
      if (value === original) delete next[p.id];
      else next[p.id] = { quantity: value };
      return next;
    });
  };

  const varVal = (vId: string, orig: number) =>
    variationEdits[vId]?.quantity ?? String(orig);

  const setVar = (vId: string, orig: number, value: string) => {
    const original = String(orig);
    setVariationEdits((prev) => {
      const next = { ...prev };
      if (value === original) delete next[vId];
      else next[vId] = { quantity: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (changedCount === 0) return;
    setSaving(true);
    const { error, saved } = await saveBulkInventory(
      productEdits,
      variationEdits
    );
    setSaving(false);
    if (error) {
      notify("error", "Save failed", error);
      return;
    }
    notify(
      "success",
      "Inventory updated",
      `${saved} row${saved === 1 ? "" : "s"} saved.`
    );
    load();
  };

  const stockBadge = (qty: string) =>
    Number(qty) > 0 ? (
      <Badge size="sm" color="success">
        In stock
      </Badge>
    ) : (
      <Badge size="sm" color="error">
        Out of stock
      </Badge>
    );

  return (
    <div>
      <PageMeta
        title="Bulk inventory | FusionEdge"
        description="Edit product and variation stock quantities in bulk"
      />
      <PageBreadcrumb pageTitle="Bulk inventory" />

      <div className="space-y-4">
        {!canStock && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
            View only — you need the stock permission to change quantities here.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or SKU"
            className="h-11 w-64 max-w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:text-white/90"
          />
          {canStock && (
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
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Product / Variation</th>
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Quantity</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) =>
                  p.kind === "variable" ? (
                    <RowGroup key={p.id}>
                      <tr className="border-b border-gray-50 bg-gray-50/60 dark:border-gray-800/60 dark:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                            <Link
                              to={`/product/${p.slug}`}
                              className="hover:text-brand-500"
                            >
                              {p.name}
                            </Link>
                            <Badge size="sm" color="info">
                              variable
                            </Badge>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400">{p.sku ?? "—"}</td>
                        <td
                          className="px-5 py-3 text-theme-xs text-gray-400"
                          colSpan={2}
                        >
                          Set per variation below
                        </td>
                      </tr>
                      {p.variations.length === 0 ? (
                        <tr className="border-b border-gray-50 dark:border-gray-800/60">
                          <td
                            className="px-5 py-3 pl-10 text-theme-xs text-gray-400"
                            colSpan={4}
                          >
                            No variations yet.
                          </td>
                        </tr>
                      ) : (
                        p.variations.map((v) => {
                          const changed = !!variationEdits[v.id];
                          const val = varVal(v.id, v.quantity);
                          return (
                            <tr
                              key={v.id}
                              className={`border-b border-gray-50 last:border-0 dark:border-gray-800/60 ${
                                changed
                                  ? "bg-brand-50/40 dark:bg-brand-500/[0.06]"
                                  : ""
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
                                  min="0"
                                  step={1}
                                  className={cellInput}
                                  disabled={!canStock}
                                  value={val}
                                  onChange={(e) =>
                                    setVar(v.id, v.quantity, e.target.value)
                                  }
                                />
                              </td>
                              <td className="px-5 py-2.5">{stockBadge(val)}</td>
                            </tr>
                          );
                        })
                      )}
                    </RowGroup>
                  ) : (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-50 last:border-0 dark:border-gray-800/60 ${
                        productEdits[p.id]
                          ? "bg-brand-50/40 dark:bg-brand-500/[0.06]"
                          : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                          <Link
                            to={`/product/${p.slug}`}
                            className="hover:text-brand-500"
                          >
                            {p.name}
                          </Link>
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
                          min="0"
                          step={1}
                          className={cellInput}
                          disabled={!canStock}
                          value={productVal(p)}
                          onChange={(e) => setProduct(p, e.target.value)}
                        />
                      </td>
                      <td className="px-5 py-3">{stockBadge(productVal(p))}</td>
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
