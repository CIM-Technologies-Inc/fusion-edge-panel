import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ProductTable from "../components/product/ProductTable";
import { useProducts } from "../hooks/useProducts";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { deleteProduct, duplicateProduct } from "../lib/products";
import type { Product as ProductType } from "../types/catalogue";

type StatusFilter = "all" | "published" | "draft";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function Product() {
  const { products: allProducts, loading, error, reload } = useProducts();
  const { isAdmin, isSupplier, session } = useAuth();
  // Suppliers see only their own products (RLS also enforces this server-side).
  const products = useMemo(
    () =>
      isSupplier && session?.user
        ? allProducts.filter((p) => p.supplier_id === session.user.id)
        : allProducts,
    [allProducts, isSupplier, session]
  );
  const { notify } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    reload();
  };

  const handleDuplicate = async (product: ProductType) => {
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
    return products.filter((p) => {
      if (status === "published" && !p.published) return false;
      if (status === "draft" && p.published) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, status]);

  return (
    <div>
      <PageMeta
        title="Products | FusionEdge"
        description="Browse the product catalogue"
      />
      <PageBreadcrumb pageTitle="Product" />

      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, slug or SKU"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 sm:w-72"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="all">All status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? "Loading…" : `${visible.length} of ${products.length}`}
            </span>
            <button
              onClick={reload}
              disabled={loading}
              className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Refresh
            </button>
            {(isAdmin || isSupplier) && (
              <>
                <Link
                  to="/product/bulk-prices"
                  className="inline-flex items-center h-11 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Bulk prices
                </Link>
                <Link
                  to="/product/new"
                  data-tour="new-product-btn"
                  className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
                >
                  + New product
                </Link>
              </>
            )}
          </div>
        </div>

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
            onDuplicate={isAdmin || isSupplier ? handleDuplicate : undefined}
            onDelete={isAdmin || isSupplier ? handleDelete : undefined}
            duplicatingId={duplicatingId}
            deletingId={deletingId}
          />
        )}
      </div>
    </div>
  );
}
