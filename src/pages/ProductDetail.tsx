import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import AttributePicker from "../components/product/AttributePicker";
import ProductGallery from "../components/product/ProductGallery";
import Model3DViewer from "../components/product/Model3DViewer";
import RichText from "../components/common/RichText";
import { useProduct } from "../hooks/useProduct";
import { useAuth } from "../context/AuthContext";
import { formatCents, formatPrice } from "../lib/price";
import {
  availableTerms,
  choiceAttributes,
  findVariation,
  outOfStockTerms,
  specAttributes,
  type Selection,
} from "../lib/variations";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, error } = useProduct(slug);
  const { isAdmin } = useAuth();
  const [selection, setSelection] = useState<Selection>({});

  useEffect(() => {
    if (!product) return;
    const defaults: Selection = {};
    for (const pa of product.attributes) {
      if (!pa.used_for_variations || !pa.default_term_id) continue;
      if (pa.terms.some((t) => t.id === pa.default_term_id)) {
        defaults[pa.attribute.id] = pa.default_term_id;
      }
    }
    setSelection(defaults);
  }, [product]);

  const choices = useMemo(
    () => (product ? choiceAttributes(product) : []),
    [product]
  );
  const specs = useMemo(
    () => (product ? specAttributes(product) : []),
    [product]
  );
  const variation = useMemo(
    () => (product ? findVariation(product, selection) : null),
    [product, selection]
  );

  const handleSelect = useCallback((attributeId: string, termId: string) => {
    setSelection((prev) => {
      if (prev[attributeId] === termId) {
        const { [attributeId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [attributeId]: termId };
    });
  }, []);

  const availableFor = useCallback(
    (attributeId: string) =>
      product ? availableTerms(product, selection, attributeId) : new Set<string>(),
    [product, selection]
  );
  const soldOutFor = useCallback(
    (attributeId: string) =>
      product ? outOfStockTerms(product, selection, attributeId) : new Set<string>(),
    [product, selection]
  );

  if (loading) {
    return (
      <div className={shell}>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
        <h4 className="mb-1 font-medium text-error-700 dark:text-error-400">
          Could not load product
        </h4>
        <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={`${shell} text-center`}>
        <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
          Product not found
        </h4>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          No product matches “{slug}”.
        </p>
        <Link
          to="/product"
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          Back to products
        </Link>
      </div>
    );
  }

  // A chosen variation overrides product-level price and stock.
  const price = variation
    ? formatCents(variation.sale_price_cents ?? variation.price_cents)
    : formatPrice(product);
  const struck = variation
    ? variation.sale_price_cents !== null
      ? variation.price_cents
      : null
    : product.sale_price_cents;
  const inStock = variation ? variation.in_stock : product.in_stock;
  const sku = variation?.sku ?? product.sku;
  const needsChoice = choices.length > 0 && !variation;
  const status = product.approval_status;

  // Percentage off, when there's a struck-through price.
  const pctOff =
    struck !== null
      ? Math.round(
          (1 -
            (variation
              ? (variation.sale_price_cents ?? variation.price_cents)
              : product.sale_price_cents ?? product.price_cents ?? 0) /
              (struck || 1)) *
            100
        )
      : null;

  const meta = [
    product.company?.name,
    product.brand?.name,
    product.category?.name,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl">
      <PageMeta
        title={`${product.name} | FusionEdge`}
        description={product.short_description ?? "Product detail"}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/product"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-500 dark:text-gray-400"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Products
        </Link>
        {isAdmin && (
          <Link
            to={`/product/${product.slug}/edit`}
            className="inline-flex items-center h-10 gap-2 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
          >
            Edit product
          </Link>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — gallery (sticky on desktop) */}
        <div className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <div className="overflow-hidden border border-gray-200 rounded-2xl bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="p-4">
              <ProductGallery
                product={product}
                variationId={variation?.id ?? null}
              />
            </div>
          </div>

          {product.model_3d_url && (
            <div className={shell}>
              <h3 className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">
                3D model
              </h3>
              <Model3DViewer src={product.model_3d_url} />
            </div>
          )}
        </div>

        {/* Right — buy column */}
        <div className="space-y-6">
          {/* Meta line */}
          {meta.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {meta.map((m, i) => (
                <span
                  key={m + i}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl font-semibold leading-tight text-gray-900 dark:text-white/90">
            {product.name}
          </h1>

          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              tone={inStock ? "green" : "red"}
              label={inStock ? "In stock" : "Out of stock"}
              dot
            />
            {status === "pending" ? (
              <StatusChip tone="amber" label="Pending approval" />
            ) : status === "rejected" ? (
              <StatusChip tone="red" label="Rejected" />
            ) : (
              <StatusChip
                tone={product.published ? "green" : "amber"}
                label={product.published ? "Published" : "Draft"}
              />
            )}
            {product.featured && <StatusChip tone="brand" label="Featured" />}
            <StatusChip
              tone="gray"
              label={product.kind === "variable" ? "Variable" : "Simple"}
            />
          </div>

          {status === "rejected" && (
            <div className="rounded-xl border border-error-500/30 bg-error-50 p-4 dark:border-error-500/30 dark:bg-error-500/10">
              <p className="text-sm font-medium text-error-700 dark:text-error-400">
                This product was not approved
              </p>
              <p className="mt-1 text-sm text-error-600 dark:text-error-300">
                {product.rejection_reason?.trim()
                  ? product.rejection_reason
                  : "An admin sent it back for changes."}
              </p>
            </div>
          )}

          {/* Price block */}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-bold text-gray-900 dark:text-white/90">
              {price}
            </span>
            {struck !== null && (
              <>
                <span className="text-lg text-gray-400 line-through">
                  {formatCents(struck)}
                </span>
                {pctOff !== null && pctOff > 0 && (
                  <span className="rounded-full bg-error-50 px-2 py-0.5 text-theme-xs font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-400">
                    −{pctOff}%
                  </span>
                )}
              </>
            )}
          </div>

          {product.short_description && (
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {product.short_description}
            </p>
          )}

          {/* Options / variations */}
          {choices.length > 0 && (
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
              <AttributePicker
                attributes={choices}
                selection={selection}
                onSelect={handleSelect}
                availableFor={availableFor}
                soldOutFor={soldOutFor}
              />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {needsChoice
                  ? "Select every option to see the exact price and stock."
                  : `Variation selected${sku ? ` · SKU ${sku}` : ""}`}
              </p>
            </div>
          )}

          {/* Key facts */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 text-sm dark:border-gray-800 dark:bg-gray-800">
            <Fact label="SKU" value={sku ?? "—"} />
            <Fact
              label="Availability"
              value={inStock ? "In stock" : "Out of stock"}
            />
            {product.kind === "variable" && (
              <Fact label="Variations" value={String(product.variations.length)} />
            )}
            {product.category?.name && (
              <Fact label="Category" value={product.category.name} />
            )}
            {product.brand?.name && (
              <Fact label="Brand" value={product.brand.name} />
            )}
            {product.company?.name && (
              <Fact label="Company" value={product.company.name} />
            )}
          </dl>

          {/* Chosen-variation extra attributes (Material, etc.) */}
          {variation && (variation.meta ?? []).length > 0 && (
            <div className={shell}>
              <h3 className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">
                This variation
              </h3>
              <dl className="space-y-2 text-sm">
                {Object.entries(
                  (variation.meta ?? []).reduce<Record<string, string[]>>(
                    (acc, m) => {
                      (acc[m.name] ??= []).push(m.value);
                      return acc;
                    },
                    {}
                  )
                ).map(([name, values]) => (
                  <div key={name} className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">{name}</dt>
                    <dd className="text-right text-gray-800 dark:text-white/90">
                      {values.join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Specifications */}
          {specs.length > 0 && (
            <div className={shell}>
              <h3 className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">
                Specifications
              </h3>
              <dl className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                {specs.map((s) => (
                  <div key={s.id} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {s.attribute.name}
                    </dt>
                    <dd className="text-right text-gray-800 dark:text-white/90">
                      {s.terms.map((t) => t.name).join(", ") || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Full description */}
      {product.description && (
        <div className={`${shell} mt-8`}>
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Description
          </h3>
          <RichText html={product.description} />
        </div>
      )}
    </div>
  );
}

/* ---- small presentational helpers ---------------------------------------- */

function StatusChip({
  label,
  tone,
  dot,
}: {
  label: string;
  tone: "green" | "red" | "amber" | "brand" | "gray";
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    green:
      "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
    red: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
    amber:
      "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300",
    brand:
      "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    gray: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
  };
  const dotColor: Record<string, string> = {
    green: "bg-success-500",
    red: "bg-error-500",
    amber: "bg-warning-500",
    brand: "bg-brand-500",
    gray: "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-theme-xs font-medium ${tones[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor[tone]}`} />}
      {label}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3 dark:bg-gray-900">
      <dt className="text-theme-xs text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800 dark:text-white/90 break-words">
        {value}
      </dd>
    </div>
  );
}
