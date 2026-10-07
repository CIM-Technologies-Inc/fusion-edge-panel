import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ProductTable from "../components/product/ProductTable";
import ActivityDrawer from "../components/common/ActivityDrawer";
import RowMenu, { MenuItem } from "../components/common/RowMenu";
import { useProducts } from "../hooks/useProducts";
import { useAttributes } from "../hooks/useAttributes";
import { useCategories } from "../hooks/useCategories";
import { useCompaniesFull } from "../hooks/useCompaniesFull";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  deleteProduct,
  deleteProducts,
  duplicateProduct,
  setProductFeatured,
  setProductsFeatured,
  setProductsPublished,
} from "../lib/products";
import { downloadCsv } from "../lib/csv";
import { buildWooProductCsv } from "../lib/productExport";
import MultiSelect from "../components/common/MultiSelect";
import { Pager } from "../components/common/ListControls";
import type { Product as ProductType } from "../types/catalogue";

const PAGE_SIZES = [10, 25, 50, 100];

type ProductStatus = "published" | "draft" | "pending" | "rejected";
const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending approval" },
  { value: "rejected", label: "Rejected" },
];
type SortKey = "name" | "created" | "updated";

/** The status bucket a product falls into. */
const statusOf = (p: ProductType): ProductStatus =>
  p.approval_status === "pending"
    ? "pending"
    : p.approval_status === "rejected"
    ? "rejected"
    : p.published
    ? "published"
    : "draft";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function Product() {
  const { products: allProducts, loading, error, reload } = useProducts();
  const { categories } = useCategories();
  const { attributes } = useAttributes();
  // Attributes flagged as storefront filters — also offered as list filters.
  const filterAttrs = attributes.filter((a) => a.filterable);
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
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  // Keep the search box in sync when arriving via the header search (?q=…).
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setQuery(q);
  }, [searchParams]);
  // Multi-select filters: empty array = no filter (all).
  const [statuses, setStatuses] = useState<ProductStatus[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Featured products float to the top only in the DEFAULT view. Once the user
  // clicks a column header to sort, honor that sort purely (no featured-first).
  const [userSorted, setUserSorted] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [filterCompanyIds, setFilterCompanyIds] = useState<string[]>([]);
  // Selected term ids per filterable attribute: { attributeId: termId[] }.
  const [attrFilters, setAttrFilters] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Bulk selection (by product id) and the in-flight bulk action, if any.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Date-range filter: which date it applies to, and the From/To bounds (local
  // yyyy-mm-dd). Empty bound = open on that side.
  const [dateField, setDateField] = useState<"created" | "updated">("created");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    // Inclusive date bounds (ms) for the chosen date field.
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const filtered = products.filter((p) => {
      // Multi-select filters: empty = no restriction, else match ANY selected.
      if (statuses.length > 0 && !statuses.includes(statusOf(p))) return false;
      if (
        categoryIds.length > 0 &&
        !(p.category && categoryIds.includes(p.category.id))
      )
        return false;
      if (
        filterCompanyIds.length > 0 &&
        !(p.company_id && filterCompanyIds.includes(p.company_id))
      )
        return false;
      // Date range on the chosen field (created/updated).
      if (fromMs !== null || toMs !== null) {
        const iso = dateField === "updated" ? p.updated_at : p.created_at;
        const t = iso ? new Date(iso).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
      // Attribute filters: for each selected attribute the product must carry
      // at least one of its selected terms (AND across attributes, OR within).
      for (const [attrId, termIds] of Object.entries(attrFilters)) {
        if (termIds.length === 0) continue;
        const pairs = p.attributeTerms ?? [];
        const has = pairs.some(
          (x) => x.attribute_id === attrId && termIds.includes(x.term_id)
        );
        if (!has) return false;
      }
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
    statuses,
    categoryIds,
    filterCompanyIds,
    dateField,
    dateFrom,
    dateTo,
    attrFilters,
    sortKey,
    sortDir,
    userSorted,
  ]);

  // How many filters are active (search excluded — it has its own field).
  const activeAttrCount = Object.values(attrFilters).filter(
    (v) => v.length > 0
  ).length;
  const activeFilterCount =
    (categoryIds.length > 0 ? 1 : 0) +
    (filterCompanyIds.length > 0 ? 1 : 0) +
    (statuses.length > 0 ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    activeAttrCount;

  // Pagination over the filtered/sorted list.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Snap back to page 1 and clear bulk selection when the filtered set changes.
  useEffect(() => {
    setPage(1);
    setCheckedIds(new Set());
  }, [
    query,
    statuses,
    categoryIds,
    filterCompanyIds,
    dateField,
    dateFrom,
    dateTo,
    attrFilters,
    sortKey,
    sortDir,
    pageSize,
  ]);
  const safePage = Math.min(page, pageCount);
  const paged = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, visible.length);

  // Bulk selection helpers (operate on the current page).
  const toggleCheck = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allPageChecked =
    paged.length > 0 && paged.every((p) => checkedIds.has(p.id));
  const toggleCheckAll = () =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allPageChecked) paged.forEach((p) => next.delete(p.id));
      else paged.forEach((p) => next.add(p.id));
      return next;
    });
  const clearChecks = () => setCheckedIds(new Set());
  const checkedCount = checkedIds.size;

  // The selected products as objects (for state-aware filtering).
  const checkedProducts = products.filter((p) => checkedIds.has(p.id));

  // How many of the selection each action would actually affect — used to
  // disable buttons that would be a no-op.
  const publishableCount = checkedProducts.filter(
    (p) =>
      !p.published &&
      p.approval_status !== "pending" &&
      p.approval_status !== "rejected"
  ).length;
  const unpublishableCount = checkedProducts.filter((p) => p.published).length;
  const toFeatureCount = checkedProducts.filter((p) => !p.featured).length;
  const toUnfeatureCount = checkedProducts.filter((p) => p.featured).length;

  const runBulk = async (
    label: string,
    ids: string[],
    fn: (ids: string[]) => Promise<{ error: string | null }>
  ) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await fn(ids);
    setBulkBusy(false);
    if (error) {
      notify("error", `${label} failed`, error);
      return;
    }
    notify("success", label, `${ids.length} product${ids.length === 1 ? "" : "s"}.`);
    clearChecks();
    reload();
  };

  // These only act on products that actually need the change (the buttons are
  // disabled when the affected count is 0, so no "nothing to do" case here).
  const bulkPublish = () =>
    runBulk(
      "Published",
      checkedProducts
        .filter(
          (p) =>
            !p.published &&
            p.approval_status !== "pending" &&
            p.approval_status !== "rejected"
        )
        .map((p) => p.id),
      (x) => setProductsPublished(x, true)
    );

  const bulkUnpublish = () =>
    runBulk(
      "Unpublished",
      checkedProducts.filter((p) => p.published).map((p) => p.id),
      (x) => setProductsPublished(x, false)
    );

  const bulkFeature = (featured: boolean) =>
    runBulk(
      featured ? "Featured" : "Unfeatured",
      checkedProducts.filter((p) => p.featured !== featured).map((p) => p.id),
      (x) => setProductsFeatured(x, featured)
    );

  const bulkDelete = () => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}? This also ` +
          `removes their variations and images and cannot be undone.`
      )
    )
      return;
    runBulk("Deleted", ids, deleteProducts);
  };

  const setDatePreset = (days: number) => {
    const iso = (d: Date) => {
      const off = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - off).toISOString().slice(0, 10);
    };
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1));
    setDateFrom(iso(start));
    setDateTo(iso(now));
  };

  const clearFilters = () => {
    setCategoryIds([]);
    setFilterCompanyIds([]);
    setStatuses([]);
    setDateFrom("");
    setDateTo("");
    setAttrFilters({});
    setShowFilters(false);
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
              {can("product", "export") && (
                <MenuItem
                  onClick={handleExportCsv}
                  disabled={loading || exporting || visible.length === 0}
                >
                  {exporting ? "Exporting…" : "Export CSV"}
                </MenuItem>
              )}
              {can("product", "import") && (
                <MenuItem onClick={() => navigate("/product/import")}>
                  Import CSV
                </MenuItem>
              )}
              {can("product", "view") && (
                <MenuItem onClick={() => navigate("/product/bulk-prices")}>
                  Bulk prices
                </MenuItem>
              )}
              {can("product", "view") && (
                <MenuItem onClick={() => navigate("/product/bulk-inventory")}>
                  Bulk inventory
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
              <MultiSelect
                label="Companies"
                className="w-full sm:w-auto"
                selected={filterCompanyIds}
                onChange={setFilterCompanyIds}
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
            <MultiSelect
              label="Categories"
              className="w-full sm:w-auto"
              selected={categoryIds}
              onChange={setCategoryIds}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <MultiSelect
              label="Status"
              className="w-full sm:w-auto"
              selected={statuses}
              onChange={(next) => setStatuses(next as ProductStatus[])}
              options={STATUS_OPTIONS}
            />

            {/* Filterable attributes (one dropdown each). */}
            {filterAttrs.map((attr) => (
              <MultiSelect
                key={attr.id}
                label={attr.name}
                className="w-full sm:w-auto"
                selected={attrFilters[attr.id] ?? []}
                onChange={(next) =>
                  setAttrFilters((prev) => ({ ...prev, [attr.id]: next }))
                }
                options={attr.terms.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            ))}

            {/* Date range: pick which date it applies to, then From–To. */}
            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-auto">
              <select
                value={dateField}
                onChange={(e) =>
                  setDateField(e.target.value as "created" | "updated")
                }
                aria-label="Date field to filter"
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="created">Created</option>
                <option value="updated">Updated</option>
              </select>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="From date"
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
              <span className="text-sm text-gray-400">–</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="To date"
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
              <div className="inline-flex h-11 overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDatePreset(7)}
                  className="px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  7d
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset(30)}
                  className="border-l border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  30d
                </button>
              </div>
            </div>

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

        {/* Result count + page-size selector. */}
        {!loading && !error && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {visible.length === 0
                ? "No products"
                : `Showing ${rangeStart}–${rangeEnd} of ${visible.length}` +
                  (query || activeFilterCount > 0
                    ? ` (filtered from ${products.length})`
                    : "")}
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

            <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              Show
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Products per page"
                className="h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              per page
            </label>
          </div>
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
          <div className={`${shell} flex flex-col items-center justify-center gap-3 py-12 text-center`}>
            {products.length === 0 ? (
              // The catalogue (for this account) is truly empty.
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l9-4 9 4-9 4-9-4z" />
                    <path d="M3 7v10l9 4 9-4V7" />
                    <path d="M12 11v10" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-800 dark:text-white/90">
                  No products yet
                </h4>
                <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  {can("product", "add")
                    ? "Get your catalogue started by adding your first product."
                    : "Nothing here yet, or nothing is visible to your account."}
                </p>
                {can("product", "add") && (
                  <Link
                    to="/product/new"
                    className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    + Add your first product
                  </Link>
                )}
              </>
            ) : (
              // Filters/search matched nothing.
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-800 dark:text-white/90">
                  No matches
                </h4>
                <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  No product matches your current search and filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    clearFilters();
                  }}
                  className="mt-1 inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <ProductTable
            products={paged}
            checkedIds={checkedIds}
            onToggleCheck={toggleCheck}
            onToggleCheckAll={toggleCheckAll}
            allChecked={allPageChecked}
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

        {!loading && !error && pageCount > 1 && (
          <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
        )}
      </div>

      {/* Bulk action bar — shown when rows are selected. Fixed to the bottom. */}
      {checkedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[99990] border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-medium text-gray-700 dark:text-gray-300">
              {checkedCount} selected
            </span>

            {can("product", "edit") && (
              <>
                <button
                  type="button"
                  disabled={bulkBusy || publishableCount === 0}
                  onClick={bulkPublish}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Publish
                </button>
                <button
                  type="button"
                  disabled={bulkBusy || unpublishableCount === 0}
                  onClick={bulkUnpublish}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Unpublish
                </button>
              </>
            )}

            {can("product", "feature") && (
              <>
                <button
                  type="button"
                  disabled={bulkBusy || toFeatureCount === 0}
                  onClick={() => bulkFeature(true)}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Feature
                </button>
                <button
                  type="button"
                  disabled={bulkBusy || toUnfeatureCount === 0}
                  onClick={() => bulkFeature(false)}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Unfeature
                </button>
              </>
            )}

            {can("product", "delete") && (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkDelete}
                className="inline-flex h-10 items-center rounded-lg border border-error-300 px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
              >
                Delete
              </button>
            )}

            <button
              type="button"
              onClick={clearChecks}
              aria-label="Clear selection"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
