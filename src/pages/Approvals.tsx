import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import RejectModal from "../components/product/RejectModal";
import {
  approveProduct,
  loadPendingProducts,
  rejectProduct,
  type PendingProduct,
} from "../lib/approvals";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

export default function Approvals() {
  const { notify } = useToast();
  const { can } = useAuth();
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The product currently being rejected (drives the reason modal).
  const [rejectTarget, setRejectTarget] = useState<PendingProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { products, error } = await loadPendingProducts();
    setProducts(products);
    setError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (p: PendingProduct) => {
    setBusyId(p.id);
    const { error } = await approveProduct(p.id);
    setBusyId(null);
    if (error) return notify("error", "Approve failed", error);
    notify("success", "Product approved", `${p.name} is now live.`);
    setProducts((list) => list.filter((x) => x.id !== p.id));
  };

  const confirmReject = async (reason: string) => {
    const p = rejectTarget;
    if (!p) return;
    setBusyId(p.id);
    const { error } = await rejectProduct(p.id, reason || undefined);
    setBusyId(null);
    setRejectTarget(null);
    if (error) return notify("error", "Reject failed", error);
    notify("info", "Product rejected", p.name);
    setProducts((list) => list.filter((x) => x.id !== p.id));
  };

  return (
    <div>
      <PageMeta
        title="Approvals | FusionEdge"
        description="Review products awaiting approval"
      />
      <PageBreadcrumb pageTitle="Approvals" />

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading
              ? "Loading…"
              : `${products.length} product${
                  products.length === 1 ? "" : "s"
                } awaiting approval`}
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : error ? (
          <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className={`${shell} text-center`}>
            <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
              Nothing to review
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No products are waiting for approval right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p) => (
              <div
                key={p.id}
                className={`${shell} flex flex-wrap items-center gap-4`}
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="object-cover w-14 h-14 rounded-lg shrink-0 bg-gray-50 dark:bg-white/[0.06]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 shrink-0 dark:bg-gray-800" />
                )}

                <div className="flex-1 min-w-40">
                  <Link
                    to={`/product/${p.slug}`}
                    className="block font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                  >
                    {p.name}
                  </Link>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                    {p.company_name ?? "—"}
                    {p.sku ? ` · ${p.sku}` : ""} · submitted{" "}
                    {fmtDate(p.updated_at)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Link
                    to={`/approvals/${p.slug}`}
                    className="h-9 inline-flex items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  >
                    Review
                  </Link>
                  {can("approval", "reject") && (
                    <button
                      type="button"
                      onClick={() => setRejectTarget(p)}
                      disabled={busyId === p.id}
                      className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-600 hover:border-error-500 hover:text-error-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                    >
                      Reject
                    </button>
                  )}
                  {can("approval", "approve") && (
                    <button
                      type="button"
                      onClick={() => handleApprove(p)}
                      disabled={busyId === p.id}
                      className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {busyId === p.id ? "…" : "Approve"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RejectModal
        isOpen={rejectTarget !== null}
        productName={rejectTarget?.name}
        busy={busyId !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}
