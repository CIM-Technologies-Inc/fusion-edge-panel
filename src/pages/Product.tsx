import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ProductTable from "../components/product/ProductTable";
import ActivityDrawer from "../components/common/ActivityDrawer";
import RowMenu, { MenuItem } from "../components/common/RowMenu";
import { useProducts } from "../hooks/useProducts";
import { useCategories } from "../hooks/useCategories";
import { useCompaniesFull } from "../hooks/useCompaniesFull";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  deleteProduct,
  duplicateProduct,
  setProductFeatured,
} from "../lib/products";
import { downloadCsv } from "../lib/csv";
import { buildWooProductCsv } from "../lib/productExport";
import type { Product as ProductType } from "../types/catalogue";

type StatusFilter = "all" | "published" | "draft" | "pending" | "rejected";
type SortKey = "name" | "created" | "updated";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function Product() {
  const { products: allProducts, loading, error, reload } = useProducts();
  const { categories } = useCategories();
  const { isAdmin, can, companyId } = useAuth();
  // The company filter is only useful to users NOT tied to a company (they see
  // every company's products); company-users are already scoped to their own.
  const showCompanyFilter = !companyId;
  const { companies } = useCompaniesFull();
  // Non-admins see only their own company's products (RLS also enforces this).
  // A non-admin with no company sees none. Pending-approval products are hidden
  // from the admin's list — they're reviewed on the Approvals page instead;
  // company-users still see their own pending items (with the Pending badge).
  const products = useMemo(() => {
    // Admins & no-company staff: all products, minus pending ones (those are
    // reviewed on the Approvals page). A user assigned to a company: only their
    // own company's products (they keep their pending items visible).
    if (isAdmin || !companyId) {
      return allProducts.filter((p) => p.approval_status !== "pending");
    }
    return allProducts.filter((p) => p.company_id === companyId);
  }, [allProducts, isAdmin, companyId]);
  const { notify } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Featured products float to the top only in the DEFAULT view. Once the user
  // clicks a column header to sort, honor that sort purely (no featured-first).
  const [userSorted, setUserSorted] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [featuringId, setFeaturingId] = useState<string | null>(null);
  // The row selected for the action popover (with its anchor rect), or null.
  const [selected, setSelected] = useState<{
    product: ProductType;
    rect: DOMRect;
  } | null>(null);
  const selectedRow = selected?.product ?? null;
  // Product whose change history is open in the activity modal, or null.
  const [activityProduct, setActivityProduct] = useState<ProductType | null>(
    null
  );

  const handleDelete = async (product: ProductType) => {
    if (
      !window.confirm(
        `Delete “${product.name}”? This removes the product and all its ` +
          `variations and images. This cannot be undone.`
      )
    )
      return;
    setDeletingId(product.id);
    const { error } = await deleteProduct(product.id);
    setDeletingId(null);

    if (error) {
      notify("error", "Delete failed", error);
      return;
    }
    notify("info", "Product deleted", product.name);
    setSelected(null);
    reload();
  };

  const handleToggleFeatured = async (product: ProductType) => {
    setFeaturingId(product.id);
    const next = !product.featured;
    const { error } = await setProductFeatured(product.id, next);
    setFeaturingId(null);
    if (error) {
      notify("error", "Couldn't update", error);
      return;
    }
    notify(
      "success",
      next ? "Product featured" : "Removed from featured",
      product.name
    );
    setSelected((s) =>
      s ? { ...s, product: { ...s.product, featured: next } } : s
    );
    reload();
  };

  const handleDuplicate = async (product: ProductType) => {
    if (product.approval_status === "pending") {
      notify(
        "error",
        "Can't duplicate",
        "This product is pending approval. Cancel the request or wait for a decision first."
      );
      return;
    }
    setDuplicatingId(product.id);
    const { error, slug } = await duplicateProduct(product.id);
    setDuplicatingId(null);

    if (error) {
      notify("error", "Duplicate failed", error);
      return;
    }
    notify(
      "success",
      "Product duplicated",
      `Created “${product.name} (copy)” as a draft.`
    );
    reload();
    if (slug) navigate(`/product/${slug}/edit`);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (status === "published" && !p.published) return false;
      if (status === "pending" && p.approval_status !== "pending") return false;
      if (status === "rejected" && p.approval_status !== "rejected")
        return false;
      // "Draft" = unpublished and not awaiting/failing approval.
      if (
        status === "draft" &&
        (p.published ||
          p.approval_status === "pending" ||
          p.approval_status === "rejected")
      )
        return false;
      if (categoryId && p.category?.id !== categoryId) return false;
      if (filterCompanyId && p.company_id !== filterCompanyId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
    // In the default view, featured products float to the top; once the user
    // sorts by a column, honor that sort purely. .sort is stable.
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: ProductType, b: ProductType) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = (sortKey === "updated" ? a.updated_at : a.created_at) ?? "";
      const bv = (sortKey === "updated" ? b.updated_at : b.created_at) ?? "";
      return av.localeCompare(bv) * dir;
    };
    return [...filtered].sort((a, b) =>
      userSorted
        ? cmp(a, b)
        : Number(!!b.featured) - Number(!!a.featured) || cmp(a, b)
    );
  }, [
    products,
    query,
    status,
    categoryId,
    filterCompanyId,
    sortKey,
    sortDir,
    userSorted,
  ]);

  // How many filters are active (search excluded — it has its own field).
  const activeFilterCount =
    (categoryId ? 1 : 0) +
    (filterCompanyId ? 1 : 0) +
    (status !== "all" ? 1 : 0);

  const clearFilters = () => {
    setCategoryId("");
    setFilterCompanyId("");
    setStatus("all");
  };

  // Export the filtered products to a WooCommerce-style CSV: one row per
  // product, plus one row per variation under its parent, with attributes as
  // numbered name/value columns. Attributes/variations aren't in the list
  // query, so fetch them just-in-time on click.
  const handleExportCsv = async () => {
    const ids = visible.map((p) => p.id);
    if (ids.length === 0) {
      notify("info", "Nothing to export", "No products match the current filters.");
      return;
    }
    setExporting(true);
    const { csv, error } = await buildWooProductCsv(ids);
    setExporting(false);
    if (error) {
      notify("error", "Export failed", error);
      return;
    }
    if (!csv) {
      notify("info", "Nothing to export", "No products to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`products-${stamp}.csv`, csv);
  };

  return (
    <div>
      <PageMeta
        title="Products | FusionEdge"
        description="Browse the product catalogue"
      />
      <PageBreadcrumb pageTitle="Product" />

      <div className="space-y-5">
        {/* Toolbar: search + filters toggle + more-actions + primary action. */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, slug or SKU"
            className="h-11 w-full min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 sm:w-64 sm:flex-none"
          />

          {/* Filters toggle with active-count badge. */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium ${
              showFilters || activeFilterCount > 0
                ? "border-brand-300 text-brand-600 dark:border-brand-500/50 dark:text-brand-300"
                : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* More actions (occasional): export, import, bulk prices, refresh. */}
            <RowMenu>
              {can("product", "view") && (
                <MenuItem
                  onClick={handleExportCsv}
                  disabled={loading || exporting || visible.length === 0}
                >
                  {exporting ? "Exporting…" : "Export CSV"}
                </MenuItem>
              )}
              {can("product", "add") && (
                <MenuItem onClick={() => navigate("/product/import")}>
                  Import CSV
                </MenuItem>
              )}
              {can("product", "view") && (
                <MenuItem onClick={() => navigate("/product/bulk-prices")}>
                  Bulk prices
                </MenuItem>
              )}
              <MenuItem onClick={() => reload()} disabled={loading}>
                Refresh
              </MenuItem>
            </RowMenu>

            {can("product", "add") && (
              <Link
                to="/product/new"
                data-tour="new-product-btn"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                + New product
              </Link>
            )}
          </div>
        </div>

        {/* Collapsible filter row. */}
        {showFilters && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02] sm:flex sm:flex-wrap sm:items-center">
            {showCompanyFilter && (
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                aria-label="Filter by company"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:w-auto"
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter by category"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:w-auto"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:w-auto"
            >
              <option value="all">All status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending approval</option>
              <option value="rejected">Rejected</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="col-span-2 inline-flex h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-500 hover:text-error-500 sm:col-auto"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Result count — reflects the active search/filters. */}
        {!loading && !error && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {(() => {
              const filtering = !!query || activeFilterCount > 0;
              if (!filtering)
                return `${products.length} product${
                  products.length === 1 ? "" : "s"
                }`;
              return `Showing ${visible.length} of ${products.length} product${
                products.length === 1 ? "" : "s"
              }`;
            })()}
            {(query || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  clearFilters();
                }}
                className="ml-2 font-medium text-brand-500 hover:text-brand-600"
              >
                Clear
              </button>
            )}
          </p>
        )}

        {loading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading products…
            </p>
          </div>
        ) : error ? (
          <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
            <h4 className="mb-1 font-medium text-error-700 dark:text-error-400">
              Could not load products
            </h4>
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className={`${shell} text-center`}>
            <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
              No products found
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {products.length === 0
                ? "The catalogue is empty, or nothing is visible to your account."
                : "No product matches the current search or filter."}
            </p>
          </div>
        ) : (
          <ProductTable
            products={visible}
            canEdit={
              can("product", "edit") ||
              can("product", "stock") ||
              can("product", "price")
            }
            onDuplicate={can("product", "add") ? handleDuplicate : undefined}
            onDelete={can("product", "delete") ? handleDelete : undefined}
            onActivity={
              can("product", "view") ? setActivityProduct : undefined
            }
            duplicatingId={duplicatingId}
            deletingId={deletingId}
            onRowClick={(product, rect) => setSelected({ product, rect })}
            selectedId={selectedRow?.id ?? null}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(key) => {
              setUserSorted(true);
              if (key === sortKey) {
                setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              } else {
                setSortKey(key);
                setSortDir("desc");
              }
            }}
          />
        )}
      </div>

      {/* Action popover for the selected row — floats just ABOVE the row and
          holds all actions, each gated by permission. */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-[99998]"
            onClick={() => setSelected(null)}
          />
          <div
            role="menu"
            style={{
              bottom: window.innerHeight - selected.rect.top + 8,
              left: Math.min(
                selected.rect.left,
                window.innerWidth - 320
              ),
            }}
            className="fixed z-[99999] flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {(can("product", "edit") ||
              can("product", "stock") ||
              can("product", "price")) && (
              <Link
                to={`/product/${selectedRow!.slug}/edit`}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                Edit
              </Link>
            )}

            {can("product", "feature") && (
              <button
                type="button"
                onClick={() => handleToggleFeatured(selectedRow!)}
                disabled={featuringId === selectedRow!.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                <svg className="h-4 w-4 text-warning-400" viewBox="0 0 24 24" fill={selectedRow!.featured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
                </svg>
                {featuringId === selectedRow!.id
                  ? "Saving…"
                  : selectedRow!.featured
                  ? "Remove feature"
                  : "Feature"}
              </button>
            )}

            {can("product", "view") && (
              <button
                type="button"
                onClick={() => {
                  setActivityProduct(selectedRow);
                  setSelected(null);
                }}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                Activity
              </button>
            )}

            {can("product", "add") && (
              <button
                type="button"
                onClick={() => handleDuplicate(selectedRow!)}
                disabled={
                  duplicatingId === selectedRow!.id ||
                  selectedRow!.approval_status === "pending"
                }
                title={
                  selectedRow!.approval_status === "pending"
                    ? "Can't duplicate a product that's pending approval"
                    : undefined
                }
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                {duplicatingId === selectedRow!.id ? "Duplicating…" : "Duplicate"}
              </button>
            )}

            {can("product", "delete") && (
              <button
                type="button"
                onClick={() => handleDelete(selectedRow!)}
                disabled={deletingId === selectedRow!.id}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:text-error-400 dark:hover:bg-error-500/10"
              >
                {deletingId === selectedRow!.id ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </>
      )}

      {/* Per-product change history, in a right-side drawer. */}
      <ActivityDrawer
        table="products"
        recordId={activityProduct?.id ?? null}
        title={activityProduct?.name}
        onClose={() => setActivityProduct(null)}
      />
    </div>
  );
}
