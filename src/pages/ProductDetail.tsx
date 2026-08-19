import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
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

  // Open with the product's default options preselected, if it has any.
  useEffect(() => {
    if (!product) return;
    const defaults: Selection = {};
    for (const pa of product.attributes) {
      if (!pa.used_for_variations || !pa.default_term_id) continue;
      // Only honour a default the product still offers.
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
      // Clicking the chosen term again clears it.
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
      <div>
        <PageBreadcrumb pageTitle="Product" />
        <div className={shell}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Product" />
        <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
          <h4 className="mb-1 font-medium text-error-700 dark:text-error-400">
            Could not load product
          </h4>
          <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Product" />
        <div className={`${shell} text-center`}>
          <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
            Product not found
          </h4>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            No published product matches “{slug}”.
          </p>
          <Link
            to="/product"
            className="text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  // A chosen variation overrides the product-level price and stock.
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

  return (
    <div>
      <PageMeta
        title={`${product.name} | FusionEdge`}
        description={product.short_description ?? "Product detail"}
      />
      <PageBreadcrumb pageTitle={product.name} />

      <div className="flex items-center justify-between mb-5">
        <Link
          to="/product"
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          ← Back to products
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className={shell}>
            <ProductGallery
              product={product}
              variationId={variation?.id ?? null}
            />
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

        <div className={shell}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge size="sm" color={product.kind === "variable" ? "info" : "light"}>
              {product.kind}
            </Badge>
            <Badge size="sm" color={product.published ? "success" : "warning"}>
              {product.published ? "Published" : "Draft"}
            </Badge>
            <Badge size="sm" color={inStock ? "success" : "error"}>
              {inStock ? "In stock" : "Out of stock"}
            </Badge>
            {product.featured && (
              <Badge size="sm" color="primary">
                Featured
              </Badge>
            )}
          </div>

          <h2 className="mb-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {product.name}
          </h2>
          {(product.company || product.brand || product.category) && (
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {[product.company?.name, product.brand?.name, product.category?.name]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <div className="flex items-baseline gap-3 mb-5">
            <span className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {price}
            </span>
            {struck !== null && (
              <span className="text-gray-400 line-through">
                {formatCents(struck)}
              </span>
            )}
          </div>

          {product.short_description && (
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
              {product.short_description}
            </p>
          )}

          {choices.length > 0 && (
            <div className="pt-5 mb-6 border-t border-gray-100 dark:border-gray-800">
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

          <dl className="pt-5 space-y-2 text-sm border-t border-gray-100 dark:border-gray-800">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">SKU</dt>
              <dd className="text-gray-800 dark:text-white/90">{sku ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Slug</dt>
              <dd className="text-gray-800 dark:text-white/90">{product.slug}</dd>
            </div>
            {product.kind === "variable" && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Variations</dt>
                <dd className="text-gray-800 dark:text-white/90">
                  {product.variations.length}
                </dd>
              </div>
            )}
            {/* Extra attributes on the chosen variation (Material, etc.). */}
            {variation &&
              Object.entries(
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

          {specs.length > 0 && (
            <dl className="pt-5 mt-5 space-y-2 text-sm border-t border-gray-100 dark:border-gray-800">
              {specs.map((s) => (
                <div key={s.id} className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {s.attribute.name}
                  </dt>
                  <dd className="text-right text-gray-800 dark:text-white/90">
                    {s.terms.map((t) => t.name).join(", ") || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {product.description && (
        <div className={`${shell} mt-6`}>
          <h3 className="mb-3 font-medium text-gray-800 dark:text-white/90">
            Description
          </h3>
          <RichText html={product.description} />
        </div>
      )}
    </div>
  );
}
