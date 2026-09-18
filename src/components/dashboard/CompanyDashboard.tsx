import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { BoxIcon, GridIcon, ListIcon, FolderIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { useProducts } from "../../hooks/useProducts";
import { useCompanies } from "../../hooks/useCompanies";
import { useAuth } from "../../context/AuthContext";
import { useTour, tourUnseen } from "../tour/TourContext";
import { listFiles } from "../../lib/media";
import { formatPrice } from "../../lib/price";
import type { Product } from "../../types/catalogue";

const card =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

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
        {sub && <span className="text-theme-xs text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}

/** Dashboard for a user assigned to a company: only their company's data. */
export default function CompanyDashboard() {
  const { products: allProducts, loading } = useProducts();
  const { companies } = useCompanies();
  const { companyId } = useAuth();
  const { start: startTour } = useTour();
  const [mediaCount, setMediaCount] = useState<number | null>(null);

  const companyName =
    companies.find((c) => c.id === companyId)?.name ?? "Your company";

  // Auto-start the walkthrough once, ever, for a company user.
  useEffect(() => {
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
  }, [startTour]);

  // Media is company-scoped, so listFiles already returns only their files.
  useEffect(() => {
    listFiles().then(({ files }) => setMediaCount(files.length));
  }, []);

  const products = useMemo(
    () =>
      companyId ? allProducts.filter((p) => p.company_id === companyId) : [],
    [allProducts, companyId]
  );

  const derived = useMemo(() => {
    const published = products.filter((p) => p.published).length;
    const inStock = products.filter((p) => p.in_stock).length;
    const featured = products.filter((p) => p.featured).length;

    // Products added per month, last 6 months.
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
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const p of products) {
      const d = new Date(p.created_at);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i !== undefined) months[i].count++;
    }

    const needs = products.filter((p) => !p.published || p.images.length === 0);

    return {
      published,
      draft: products.length - published,
      inStock,
      outOfStock: products.length - inStock,
      featured,
      months,
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

  const recent = products.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {companyName}
          </h2>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Your company overview
          </p>
        </div>
        <button
          type="button"
          onClick={startTour}
          className="inline-flex items-center h-9 gap-2 px-3 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          <span aria-hidden>💡</span> Take a tour
        </button>
      </div>

      {/* Stat cards — all about their company. */}
      <div
        data-tour="dashboard-stats"
        className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4"
      >
        <StatCard
          icon={<BoxIcon className="w-5 h-5" />}
          label="Products"
          value={loading ? "…" : total}
          sub={`${derived.published} published · ${derived.draft} draft`}
        />
        <StatCard
          icon={<ListIcon className="w-5 h-5" />}
          label="In stock"
          value={derived.inStock}
          sub={`${derived.outOfStock} out of stock`}
        />
        <StatCard
          icon={<GridIcon className="w-5 h-5" />}
          label="Featured"
          value={derived.featured}
          sub="of your products"
        />
        <StatCard
          icon={<FolderIcon className="w-5 h-5" />}
          label="Media"
          value={mediaCount ?? "…"}
          sub="in your library"
        />
      </div>

      {/* Products added chart */}
      <div className={card}>
        <h3 className="mb-1 font-semibold text-gray-800 dark:text-white/90">
          Products added
        </h3>
        <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
          Last 6 months
        </p>
        <Chart
          options={barOptions}
          series={[{ name: "Products", data: derived.months.map((m) => m.count) }]}
          type="bar"
          height={260}
        />
      </div>

      {/* Recent + needs attention */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
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
              <ul className="space-y-2">
                {recent.map((p: Product) => (
                  <li key={p.id}>
                    <Link
                      to={`/product/${p.slug}/edit`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 overflow-hidden rounded bg-gray-100 shrink-0 dark:bg-gray-800">
                          {p.images[0]?.url && (
                            <img
                              src={p.images[0].url}
                              alt=""
                              className="object-cover w-full h-full"
                            />
                          )}
                        </span>
                        <span className="text-sm text-gray-700 truncate dark:text-gray-300">
                          {p.name}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {formatPrice(p)}
                        </span>
                        <Badge size="sm" color={p.published ? "success" : "warning"}>
                          {p.published ? "Published" : "Draft"}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              </ul>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
