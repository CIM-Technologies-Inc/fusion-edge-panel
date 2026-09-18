import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import RejectModal from "../components/product/RejectModal";
import { useToast } from "../context/ToastContext";
import {
  approveProduct,
  loadProductReview,
  rejectProduct,
  type ProductReview,
} from "../lib/approvals";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function ApprovalReview() {
  const { slug } = useParams<{ slug: string }>();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [review, setReview] = useState<ProductReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { review, error } = await loadProductReview(slug);
    setReview(review);
    setError(error);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    if (!review) return;
    setBusy(true);
    const { error } = await approveProduct(review.id);
    setBusy(false);
    if (error) return notify("error", "Approve failed", error);
    notify("success", "Product approved", `${review.name} is now live.`);
    navigate("/approvals");
  };

  const confirmReject = async (reason: string) => {
    if (!review) return;
    setBusy(true);
    const { error } = await rejectProduct(review.id, reason || undefined);
    setBusy(false);
    setRejectOpen(false);
    if (error) return notify("error", "Reject failed", error);
    notify("info", "Product rejected", review.name);
    navigate("/approvals");
  };

  const changedCount = review?.fields.filter((f) => f.changed).length ?? 0;

  return (
    <div>
      <PageMeta title="Review product | FusionEdge" description="Review a product for approval" />
      <PageBreadcrumb pageTitle="Review product" />

      <div className="mb-5">
        <Link
          to="/approvals"
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          ← Back to approvals
        </Link>
      </div>

      {loading ? (
        <div className={shell}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      ) : error || !review ? (
        <div className={`${shell} text-center`}>
          <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
            {error ?? "Product not found"}
          </h4>
          <Link to="/approvals" className="text-sm text-brand-500">
            Back to approvals
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: field-by-field review */}
          <div className="space-y-6 lg:col-span-2">
            <div className={`${shell} flex flex-wrap items-center gap-3`}>
              <div className="flex-1 min-w-40">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                  {review.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {review.company_name ?? "—"}
                </p>
              </div>
              {review.firstSubmission ? (
                <Badge size="sm" color="info">
                  New product
                </Badge>
              ) : changedCount > 0 ? (
                <Badge size="sm" color="warning">
                  {changedCount} change{changedCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge size="sm" color="light">
                  No field changes
                </Badge>
              )}
            </div>

            <div className={shell}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {review.fields.map((f) => (
                      <tr
                        key={f.key}
                        className={`border-b border-gray-100 last:border-0 dark:border-gray-800 ${
                          f.changed ? "bg-warning-50 dark:bg-warning-500/10" : ""
                        }`}
                      >
                        <td className="w-40 py-3 pr-3 align-top text-gray-500 dark:text-gray-400">
                          {f.label}
                          {f.changed && (
                            <span className="ml-2 rounded-full bg-warning-100 px-1.5 py-0.5 text-[10px] font-medium text-warning-700 dark:bg-warning-500/20 dark:text-warning-300">
                              changed
                            </span>
                          )}
                        </td>
                        <td className="py-3 align-top text-gray-800 dark:text-white/90">
                          <div className="whitespace-pre-line">{f.current}</div>
                          {f.changed && f.previous !== null && (
                            <div className="mt-1 whitespace-pre-line text-theme-xs text-gray-400 line-through">
                              {f.previous}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: images + actions */}
          <div className="space-y-6">
            <div className={shell}>
              <h3 className="mb-3 font-medium text-gray-800 dark:text-white/90">
                Images
              </h3>
              {review.images.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No images.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {review.images.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="object-cover w-full rounded-lg aspect-square bg-gray-50 dark:bg-white/[0.06]"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className={`${shell} space-y-3`}>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={busy}
                className="w-full h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:border-error-500 hover:text-error-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy}
                className="w-full h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? "Working…" : "Approve & publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      <RejectModal
        isOpen={rejectOpen}
        productName={review?.name}
        busy={busy}
        onClose={() => setRejectOpen(false)}
        onConfirm={confirmReject}
      />
    </div>
  );
}
