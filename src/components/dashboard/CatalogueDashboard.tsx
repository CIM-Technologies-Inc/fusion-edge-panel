import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { BoxIcon, GridIcon, GroupIcon, ListIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { useProducts } from "../../hooks/useProducts";
import { useDashboardStats } from "../../hooks/useDashboardStats";
import { useAuth } from "../../context/AuthContext";
import { useTour, tourUnseen } from "../tour/TourContext";
import { formatPrice } from "../../lib/price";
import type { Product } from "../../types/catalogue";

const card =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

/** A single headline number with an icon. */
function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className={card}>
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {icon}
      </div>
      <div className="mt-4">
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <h4 className="mt-1 text-2xl font-bold text-gray-800 dark:text-white/90">
          {value}
        </h4>
        {sub && (
          <span className="text-theme-xs text-gray-400">{sub}</span>
        )}
      </div>
    </div>
  );
}

/** Newest-first slice of products, shown as a compact table. */
function RecentProducts({ products }: { products: Product[] }) {
  const recent = products.slice(0, 6);
  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 dark:text-white/90">
          Recent products
        </h3>
        <Link
          to="/product"
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          View all
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No products yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 px-3 font-medium">Price</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 overflow-hidden rounded-lg bg-gray-100 shrink-0 dark:bg-gray-800">
                        {p.images[0]?.url && (
                          <img
                            src={p.images[0].url}
                            alt=""
                            className="object-cover w-full h-full"
                          />
                        )}
                      </div>
                      <Link
                        to={`/product/${p.slug}/edit`}
                        className="font-medium text-gray-800 truncate hover:text-brand-500 dark:text-white/90"
                      >
                        {p.name}
                      </Link>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">
                    {formatPrice(p)}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <Badge size="sm" color={p.published ? "success" : "warning"}>
                      {p.published ? "Published" : "Draft"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CatalogueDashboard() {
  const { products: allProducts, loading: productsLoading } = useProducts();
  const { stats } = useDashboardStats();
  const { isSupplier, session } = useAuth();
  const { start: startTour } = useTour();

  // Auto-start the walkthrough once, ever, for a new supplier (per-user flag).
  useEffect(() => {
    if (!isSupplier) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    tourUnseen().then((unseen) => {
      if (cancelled || !unseen) return;
      timer = setTimeout(() => startTour(), 600);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSupplier, startTour]);

  // Suppliers see only their own products in every dashboard number.
  const products = useMemo(
    () =>
      isSupplier && session?.user
        ? allProducts.filter((p) => p.supplier_id === session.user.id)
        : allProducts,
    [allProducts, isSupplier, session]
  );

  // Everything derived from the product list, computed once.
  const derived = useMemo(() => {
    const published = products.filter((p) => p.published).length;
    const inStock = products.filter((p) => p.in_stock).length;
    const featured = products.filter((p) => p.featured).length;

    // Products added per month over the last 6 months.
    const now = new Date();
    const months: { label: string; key: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString(undefined, { month: "short" }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
        count: 0,
      });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    for (const p of products) {
      const d = new Date(p.created_at);
      const idx = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx !== undefined) months[idx].count++;
    }

    // Product count per category (top 6, rest folded into "Other").
    const byCat = new Map<string, number>();
    for (const p of products) {
      const name = p.category?.name ?? "Uncategorised";
      byCat.set(name, (byCat.get(name) ?? 0) + 1);
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const topCats = cats.slice(0, 6);
    const otherTotal = cats.slice(6).reduce((s, [, n]) => s + n, 0);
    if (otherTotal > 0) topCats.push(["Other", otherTotal]);

    // Products that need attention.
    const needs = products.filter(
      (p) => !p.published || p.images.length === 0
    );

    return {
      published,
      draft: products.length - published,
      inStock,
      outOfStock: products.length - inStock,
      featured,
      months,
      categoryLabels: topCats.map(([n]) => n),
      categorySeries: topCats.map(([, n]) => n),
      needs,
    };
  }, [products]);

  const total = products.length;

  const barOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#465fff"],
    plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
    dataLabels: { enabled: false },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
    xaxis: {
      categories: derived.months.map((m) => m.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { formatter: (v) => `${Math.round(v)}` } },
    tooltip: { y: { formatter: (v) => `${v} product${v === 1 ? "" : "s"}` } },
  };

  const donutOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit" },
    labels: derived.categoryLabels,
    legend: { position: "bottom" },
    dataLabels: { enabled: false },
    colors: [
      "#465fff",
      "#12b76a",
      "#f79009",
      "#f04438",
      "#7a5af8",
      "#06aed4",
      "#98a2b3",
    ],
    stroke: { width: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Overview
        </h2>
        <button
          type="button"
          onClick={startTour}
          className="inline-flex items-center h-9 gap-2 px-3 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          <span aria-hidden>💡</span> Take a tour
        </button>
      </div>

      {/* Stat cards. Suppliers get numbers about their own products only;
          admins get the catalogue-wide totals. */}
      <div
        data-tour="dashboard-stats"
        className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4"
      >
        <StatCard
          icon={<BoxIcon className="w-5 h-5" />}
          label="Products"
          value={productsLoading ? "…" : total}
          sub={`${derived.published} published · ${derived.draft} draft`}
        />
        {isSupplier ? (
          <>
            <StatCard
              icon={<ListIcon className="w-5 h-5" />}
              label="Published"
              value={derived.published}
              sub={`${derived.draft} in draft`}
            />
            <StatCard
              icon={<GridIcon className="w-5 h-5" />}
              label="In stock"
              value={derived.inStock}
              sub={`${derived.outOfStock} out of stock`}
            />
            <StatCard
              icon={<GroupIcon className="w-5 h-5" />}
              label="Featured"
              value={derived.featured}
              sub="of your products"
            />
          </>
        ) : (
          <>
            <StatCard
              icon={<ListIcon className="w-5 h-5" />}
              label="Variations"
              value={stats.variations}
              sub={`${derived.inStock} products in stock`}
            />
            <StatCard
              icon={<GridIcon className="w-5 h-5" />}
              label="Categories / Brands"
              value={`${stats.categories} / ${stats.brands}`}
              sub={`${stats.companies} companies`}
            />
            <StatCard
              icon={<GroupIcon className="w-5 h-5" />}
              label="Users"
              value={stats.users}
              sub={`${stats.savedItems} saved items`}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
          <div className={card}>
            <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90">
              Products added
            </h3>
            <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
              Last 6 months
            </p>
            <Chart
              options={barOptions}
              series={[
                { name: "Products", data: derived.months.map((m) => m.count) },
              ]}
              type="bar"
              height={260}
            />
          </div>
        </div>
        <div className="col-span-12 xl:col-span-5">
          <div className={card}>
            <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90">
              Products by category
            </h3>
            <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
              {total} total
            </p>
            {total === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No products yet.
              </p>
            ) : (
              <Chart
                options={donutOptions}
                series={derived.categorySeries}
                type="donut"
                height={280}
              />
            )}
          </div>
        </div>
      </div>

      {/* Recent products + needs attention */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
          <RecentProducts products={products} />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <div className={card}>
            <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90">
              Needs attention
            </h3>
            <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
              Unpublished or missing an image
            </p>
            {derived.needs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Everything looks good. 🎉
              </p>
            ) : (
              <ul className="space-y-2">
                {derived.needs.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/product/${p.slug}/edit`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                    >
                      <span className="text-sm text-gray-700 truncate dark:text-gray-300">
                        {p.name}
                      </span>
                      <span className="flex gap-1.5 shrink-0">
                        {!p.published && (
                          <Badge size="sm" color="warning">
                            Draft
                          </Badge>
                        )}
                        {p.images.length === 0 && (
                          <Badge size="sm" color="error">
                            No image
                          </Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
                {derived.needs.length > 6 && (
                  <li className="pt-1 text-theme-xs text-gray-400">
                    +{derived.needs.length - 6} more
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
