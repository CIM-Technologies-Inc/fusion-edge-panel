import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import RichTextEditor from "../components/form/RichTextEditor";
import AttributeBuilder from "../components/product/AttributeBuilder";
import ImagePreview from "../components/product/ImagePreview";
import Model3DField from "../components/product/Model3DField";
import VariationBuilder from "../components/product/VariationBuilder";
import Tabs from "../components/common/Tabs";
import {
  saveVariations,
  validateVariations,
  type VariationDraft,
} from "../lib/variationsAdmin";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { useProduct } from "../hooks/useProduct";
import { useAttributes } from "../hooks/useAttributes";
import { useToast } from "../context/ToastContext";
import { centsToInput, inputToCents } from "../lib/price";
import { uploadFileWithProgress } from "../lib/media";
import {
  syncProductImages,
  updateProduct,
  validateFields,
  type FieldErrors,
  type ProductEdit,
} from "../lib/products";
import { useCategories } from "../hooks/useCategories";
import { useCompanyBrands } from "../hooks/useCompanyBrands";
import MediaPicker from "../components/media/MediaPicker";
import {
  resolveRequiredAssignments,
  syncProductAttributes,
  type AttributeAssignment,
} from "../lib/attributes";
import { getRequiredAttributes } from "../lib/requiredAttributes";
import { slugify } from "../lib/products";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

type FormState = {
  name: string;
  slug: string;
  sku: string;
  category_id: string;
  brand_id: string;
  company_id: string;
  model_3d_url: string;
  short_description: string;
  description: string;
  price: string;
  sale_price: string;
  in_stock: boolean;
  featured: boolean;
  published: boolean;
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

export default function ProductEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, error } = useProduct(slug);
  // Scope the attribute pool to this product: globals + its own private values.
  const { attributes, reload: reloadAttributes } = useAttributes(product?.id);
  const { categories } = useCategories();
  const { companies, brandsByCompany } = useCompanyBrands();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState | null>(null);
  const [assignments, setAssignments] = useState<AttributeAssignment[]>([]);
  // Category-required attribute values (slug -> value) and their errors.
  const [reqValues, setReqValues] = useState<Record<string, string>>({});
  const [reqErrors, setReqErrors] = useState<Record<string, string>>({});
  // Which required-image field the media picker is filling (its slug), or null.
  const [reqPicker, setReqPicker] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([""]);
  const [variations, setVariations] = useState<VariationDraft[]>([]);
  const [dataTab, setDataTab] = useState<"attributes" | "variations">(
    "attributes"
  );
  // Which image row the media picker is filling, or null when closed.
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // Seed the form once the product loads.
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      slug: product.slug,
      sku: product.sku ?? "",
      category_id: product.category?.id ?? "",
      brand_id: product.brand?.id ?? "",
      company_id: product.company?.id ?? "",
      model_3d_url: product.model_3d_url ?? "",
      short_description: product.short_description ?? "",
      description: product.description ?? "",
      price: centsToInput(product.price_cents),
      sale_price: centsToInput(product.sale_price_cents),
      in_stock: product.in_stock,
      featured: product.featured,
      published: product.published,
    });
    // Seed attribute assignments from the product's existing links.
    setAssignments(
      product.attributes.map((pa) => ({
        attribute_id: pa.attribute.id,
        used_for_variations: pa.used_for_variations,
        term_ids: pa.terms.map((t) => t.id),
        default_term_id: pa.default_term_id ?? null,
      }))
    );
    // Pre-fill category-required fields from existing attribute term values
    // (matched by the attribute's slug; first term value wins).
    const bySlug: Record<string, string> = {};
    for (const pa of product.attributes) {
      const v = pa.terms[0]?.name;
      if (v) bySlug[pa.attribute.slug] = v;
    }
    setReqValues(bySlug);
    setReqErrors({});
    // Only the product-level images are editable here; variation galleries
    // are managed with their variation.
    const own = product.images
      .filter((i) => i.variation_id === null)
      .map((i) => i.url);
    setImages(own.length > 0 ? own : [""]);

    // Seed variation drafts, pairing each with its own image if it has one.
    setVariations(
      product.variations.map((v, position) => {
        // Group flat meta rows (name, value) into { name, values[] }.
        const byName = new Map<string, string[]>();
        for (const m of v.meta ?? []) {
          const arr = byName.get(m.name) ?? [];
          arr.push(m.value);
          byName.set(m.name, arr);
        }
        return {
          id: v.id,
          terms: Object.fromEntries(
            v.terms.map((t) => [t.attribute_id, t.term_id])
          ),
          price: centsToInput(v.price_cents),
          sale_price: centsToInput(v.sale_price_cents),
          sku: v.sku ?? "",
          in_stock: v.in_stock,
          image_url:
            product.images.find((i) => i.variation_id === v.id)?.url ?? "",
          position,
          meta: [...byName.entries()].map(([name, values]) => ({ name, values })),
        };
      })
    );
  }, [product]);

  if (loading || !form) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Edit product" />
        <div className={shell}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error ? error : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Edit product" />
        <div className={`${shell} text-center`}>
          <h4 className="mb-2 font-medium text-gray-800 dark:text-white/90">
            Product not found
          </h4>
          <Link to="/product" className="text-sm text-brand-500">
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  const isVariable = product.kind === "variable";

  // Category-required attributes for the currently selected category (by slug).
  const categorySlug =
    categories.find((c) => c.id === form.category_id)?.slug ?? null;
  const requiredAttrs = getRequiredAttributes(categorySlug);
  // Field values are keyed by the attribute slug so they line up with the
  // product's stored attributes (which we pre-filled by slug on load).
  const reqKey = (name: string) => slugify(name);

  // The config attributes are managed only in the "Required for this category"
  // card — hide them from the regular Attributes list so they don't appear
  // twice. Matched by slug.
  const requiredSlugSet = new Set(requiredAttrs.map((ra) => reqKey(ra.name)));
  const requiredAttrIdSet = new Set(
    attributes.filter((a) => requiredSlugSet.has(a.slug)).map((a) => a.id)
  );
  const builderPool = attributes.filter(
    (a) => !requiredSlugSet.has(a.slug)
  );
  const builderAssignments = assignments.filter(
    (a) => !requiredAttrIdSet.has(a.attribute_id)
  );

  // Brands available for the chosen company (the Brand picker filters by it).
  const companyBrands = form.company_id
    ? brandsByCompany.get(form.company_id) ?? []
    : [];

  /**
   * The variation-forming attributes, narrowed to the terms this product
   * actually offers — that subset is what the combinations are built from.
   */
  const variationAttributes = assignments
    .filter((a) => a.used_for_variations)
    .map((a) => {
      const pool = attributes.find((p) => p.id === a.attribute_id);
      return {
        id: a.attribute_id,
        used_for_variations: true,
        position: 0,
        attribute: pool ?? {
          id: a.attribute_id,
          name: "Attribute",
          slug: "",
          display_type: "select" as const,
          position: 0,
        },
        terms: (pool?.terms ?? []).filter((t) => a.term_ids.includes(t.id)),
      };
    });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    // Keep field errors live after the first submit.
    if (submitted && form) {
      const next = { ...form, [key]: value };
      const p = inputToCents(next.price);
      const s = inputToCents(next.sale_price);
      setFieldErrors(
        validateFields({
          name: next.name,
          slug: next.slug,
          kind: product.kind,
          price_cents: isVariable ? null : Number.isNaN(p) ? null : p,
          sale_price_cents: isVariable ? null : Number.isNaN(s) ? null : s,
          category_id: next.category_id,
          company_id: next.company_id,
          brand_id: next.brand_id,
          image_urls: images.map((u) => u.trim()).filter(Boolean),
        })
      );
    }
  };

  const setImageAt = (i: number, v: string) =>
    setImages((list) => list.map((u, idx) => (idx === i ? v : u)));
  const addImage = () => setImages((list) => [...list, ""]);
  /** Preview removal also clears the last remaining row. */
  const removeImageFromPreview = (i: number) =>
    setImages((list) =>
      list.length > 1
        ? list.filter((_, idx) => idx !== i)
        : list.map((u, idx) => (idx === i ? "" : u))
    );
  /** Move image at index `from` to `to`, reindexing the rest (drag reorder). */
  const reorderImage = (from: number, to: number) =>
    setImages((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  /** Upload image files dropped on the preview, then add their URLs. */
  const handleDropFiles = async (files: File[]) => {
    const urls: string[] = [];
    for (const file of files) {
      setUploadProgress(0);
      const { url, error } = await uploadFileWithProgress(file, setUploadProgress);
      if (error) notify("error", `Upload failed: ${file.name}`, error);
      else if (url) urls.push(url);
    }
    setUploadProgress(null);
    if (urls.length === 0) return;

    setImages((list) => {
      // Reuse any blank slots first, then append the rest.
      const next = [...list];
      let u = 0;
      for (let i = 0; i < next.length && u < urls.length; i++) {
        if (next[i].trim() === "") next[i] = urls[u++];
      }
      while (u < urls.length) next.push(urls[u++]);
      return next;
    });
    notify("success", "Image added", `${urls.length} uploaded.`);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !product) return;
    setFormError(null);
    setSubmitted(true);

    const price = inputToCents(form.price);
    const salePrice = inputToCents(form.sale_price);
    if (Number.isNaN(price) || Number.isNaN(salePrice)) {
      setFieldErrors({ price: "Prices must be valid numbers." });
      notify("error", "Check the form", "Prices must be valid numbers.");
      return;
    }

    const imageUrls = images.map((u) => u.trim()).filter(Boolean);

    const errors = validateFields({
      name: form.name,
      slug: form.slug,
      kind: product.kind,
      price_cents: isVariable ? null : price,
      sale_price_cents: isVariable ? null : salePrice,
      category_id: form.category_id,
      company_id: form.company_id,
      brand_id: form.brand_id,
      image_urls: imageUrls,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify("error", "Check the form", "Some fields need attention.");
      return;
    }

    // Category-required attributes must be filled in.
    const reqErr: Record<string, string> = {};
    for (const ra of requiredAttrs) {
      if (ra.required && !(reqValues[reqKey(ra.name)] ?? ra.default ?? "").trim())
        reqErr[reqKey(ra.name)] = `${ra.label} is required.`;
    }
    setReqErrors(reqErr);
    if (Object.keys(reqErr).length > 0) {
      notify(
        "error",
        "Required fields missing",
        "Fill in the required attributes for this category."
      );
      return;
    }

    // An attribute with no values chosen can't be saved (it would be silently
    // dropped), so flag it by name instead of losing it on a "success" save.
    const emptyAttr = assignments.find((a) => a.term_ids.length === 0);
    if (emptyAttr) {
      const name =
        attributes.find((p) => p.id === emptyAttr.attribute_id)?.name ??
        "An attribute";
      const msg = `${name} has no values selected. Pick at least one value or remove it.`;
      setFormError(msg);
      notify("error", "Check the attributes", msg);
      return;
    }

    // Variations carry their own prices; check them before touching the DB.
    if (isVariable) {
      const varProblem = validateVariations(variations);
      if (varProblem) {
        setFormError(varProblem);
        notify("error", "Check the variations", varProblem);
        return;
      }
    }

    // TipTap emits "<p></p>" for an empty document — treat that as no content.
    const descHtml = form.description.trim();
    const descEmpty = descHtml === "" || descHtml === "<p></p>";

    const edit: ProductEdit = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      sku: form.sku.trim() || null,
      category_id: form.category_id || null,
      brand_id: form.brand_id || null,
      company_id: form.company_id || null,
      model_3d_url: form.model_3d_url.trim() || null,
      short_description: form.short_description.trim() || null,
      description: descEmpty ? null : descHtml,
      // Never write price columns for a variable product — the trigger owns them.
      price_cents: isVariable ? null : price,
      sale_price_cents: isVariable ? null : salePrice,
      in_stock: form.in_stock,
      featured: form.featured,
      published: form.published,
    };

    setSaving(true);
    const { error } = await updateProduct(product.id, edit);

    if (error) {
      setSaving(false);
      setFormError(error);
      notify("error", "Save failed", error);
      return;
    }

    // Category-required attributes: drop the product's existing assignments for
    // those config attributes (matched by slug), then re-resolve fresh from the
    // field values so edits replace rather than duplicate them.
    const reqSlugs = new Set(requiredAttrs.map((ra) => reqKey(ra.name)));
    const reqAttrIds = new Set(
      attributes
        .filter((a) => reqSlugs.has(a.slug))
        .map((a) => a.id)
    );
    const nonReqAssignments = assignments.filter(
      (a) => !reqAttrIds.has(a.attribute_id)
    );

    let requiredAssignments: AttributeAssignment[] = [];
    if (requiredAttrs.length > 0) {
      const filled = requiredAttrs.map((ra) => ({
        name: ra.name,
        value: reqValues[reqKey(ra.name)] ?? ra.default ?? "",
      }));
      const res = await resolveRequiredAssignments(product.id, filled);
      if (res.error) {
        setSaving(false);
        notify("error", "Saved, but required attrs failed", res.error);
        navigate(`/product/${edit.slug}`);
        return;
      }
      requiredAssignments = res.assignments;
    }

    // Replace the product's attribute assignments with the current set.
    // Simple products never carry variation attributes — force specs.
    const safeAssignments = [
      ...(isVariable
        ? nonReqAssignments
        : nonReqAssignments.map((a) => ({ ...a, used_for_variations: false }))),
      ...requiredAssignments, // always specs
    ];
    const { error: attrErr } = await syncProductAttributes(
      product.id,
      safeAssignments
    );

    if (attrErr) {
      setSaving(false);
      notify("error", "Saved, but attributes failed", attrErr);
      navigate(`/product/${edit.slug}`);
      return;
    }

    // Variations first: deleting them cascades to their images, so this must
    // happen before the product-level image sync writes anything.
    if (isVariable) {
      const { error: varErr } = await saveVariations(product.id, variations);
      if (varErr) {
        setSaving(false);
        notify("error", "Saved, but variations failed", varErr);
        navigate(`/product/${edit.slug}`);
        return;
      }
    }

    // Replace the product-level images (variation galleries are untouched).
    const { error: imgErr } = await syncProductImages(
      product.id,
      edit.name,
      imageUrls
    );
    setSaving(false);

    if (imgErr) {
      notify("error", "Saved, but images failed", imgErr);
      navigate(`/product/${edit.slug}`);
      return;
    }

    notify("success", "Product updated", `${edit.name} was saved.`);
    navigate(`/product/${edit.slug}`);
  }

  return (
    <div>
      <PageMeta
        title={`Edit ${product.name} | FusionEdge`}
        description="Edit product"
      />
      <PageBreadcrumb pageTitle="Edit product" />

      <div className="flex items-center gap-3 mb-5">
        <Link
          to={`/product/${product.slug}`}
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          ← Back to product
        </Link>
        <Badge size="sm" color={isVariable ? "info" : "light"}>
          {product.kind}
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        {/* Left column: details card, then the attributes card. */}
        <div className="space-y-6 lg:col-span-2">
        <div className={`${shell} space-y-5`}>
          <div>
            <Label>
              Name <span className="text-error-500">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              error={!!fieldErrors.name}
              hint={fieldErrors.name}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>
                Slug <span className="text-error-500">*</span>
              </Label>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                error={!!fieldErrors.slug}
                hint={fieldErrors.slug}
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>
                Category <span className="text-error-500">*</span>
              </Label>
              <select
                value={form.category_id}
                onChange={(e) => set("category_id", e.target.value)}
                className={`${inputClass} dark:bg-gray-900 ${
                  fieldErrors.category
                    ? "border-error-500 focus:border-error-300 focus:ring-error-500/20"
                    : ""
                }`}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldErrors.category && (
                <p className="mt-1.5 text-xs text-error-500">
                  {fieldErrors.category}
                </p>
              )}
            </div>
            <div>
              <Label>
                Company <span className="text-error-500">*</span>
              </Label>
              <select
                value={form.company_id}
                onChange={(e) => {
                  const cid = e.target.value;
                  const allowed = cid ? brandsByCompany.get(cid) ?? [] : [];
                  const keepBrand = allowed.some((b) => b.id === form.brand_id)
                    ? form.brand_id
                    : "";
                  // Update both in one pass so the brand can't dangle.
                  setForm((f) =>
                    f ? { ...f, company_id: cid, brand_id: keepBrand } : f
                  );
                }}
                className={`${inputClass} dark:bg-gray-900 ${
                  fieldErrors.company
                    ? "border-error-500 focus:border-error-300 focus:ring-error-500/20"
                    : ""
                }`}
              >
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldErrors.company && (
                <p className="mt-1.5 text-xs text-error-500">
                  {fieldErrors.company}
                </p>
              )}
            </div>
            <div>
              <Label>
                Brand <span className="text-error-500">*</span>
              </Label>
              <select
                value={form.brand_id}
                disabled={!form.company_id}
                onChange={(e) => set("brand_id", e.target.value)}
                className={`${inputClass} dark:bg-gray-900 disabled:opacity-50 ${
                  fieldErrors.brand
                    ? "border-error-500 focus:border-error-300 focus:ring-error-500/20"
                    : ""
                }`}
              >
                <option value="">
                  {form.company_id
                    ? companyBrands.length
                      ? "Select a brand…"
                      : "No brands in this company"
                    : "Pick a company first"}
                </option>
                {companyBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {fieldErrors.brand && (
                <p className="mt-1.5 text-xs text-error-500">
                  {fieldErrors.brand}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label>Short description</Label>
            <textarea
              rows={2}
              value={form.short_description}
              onChange={(e) => set("short_description", e.target.value)}
              className={`${inputClass} h-auto py-2.5`}
            />
          </div>
          <div>
            <Label>Description</Label>
            <RichTextEditor
              value={form.description}
              onChange={(html) => set("description", html)}
            />
          </div>

        </div>

        {/* Required attributes for this category (from requiredAttributes.json). */}
        {requiredAttrs.length > 0 && (
          <div className={`${shell} space-y-4`}>
            <div>
              <h3 className="font-medium text-gray-800 dark:text-white/90">
                Required for this category
              </h3>
              <p className="text-theme-xs text-gray-400">
                These fields are required for{" "}
                {categories.find((c) => c.id === form.category_id)?.name}.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {requiredAttrs.map((ra) => {
                const key = reqKey(ra.name);
                const val = reqValues[key] ?? ra.default ?? "";
                const setVal = (next: string) => {
                  setReqValues((v) => ({ ...v, [key]: next }));
                  setReqErrors((er) => {
                    const { [key]: _drop, ...rest } = er;
                    return rest;
                  });
                };
                return (
                  <div key={ra.name}>
                    <Label>
                      {ra.label}{" "}
                      {ra.required && <span className="text-error-500">*</span>}
                    </Label>
                    {ra.type === "color" ? (
                      <div className="flex gap-2">
                        <input
                          type="color"
                          aria-label={`${ra.label} color`}
                          value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : "#000000"}
                          onChange={(e) => setVal(e.target.value)}
                          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent dark:border-gray-700"
                        />
                        <Input
                          value={val}
                          placeholder="#000000"
                          error={!!reqErrors[key]}
                          hint={reqErrors[key]}
                          onChange={(e) => setVal(e.target.value)}
                        />
                      </div>
                    ) : ra.type === "image" ? (
                      <div className="flex items-start gap-2">
                        <div className="w-11 h-11 overflow-hidden border border-gray-200 rounded-lg shrink-0 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03]">
                          {val.trim() && (
                            <img
                              src={val}
                              alt=""
                              className="object-cover w-full h-full"
                            />
                          )}
                        </div>
                        <Input
                          value={val}
                          placeholder="Image URL (https://…)"
                          error={!!reqErrors[key]}
                          hint={reqErrors[key]}
                          onChange={(e) => setVal(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setReqPicker(key)}
                          className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Choose
                        </button>
                      </div>
                    ) : (
                      <Input
                        type={ra.type === "number" ? "number" : "text"}
                        value={val}
                        placeholder={ra.type === "url" ? "https://…" : ""}
                        error={!!reqErrors[key]}
                        hint={reqErrors[key]}
                        onChange={(e) => setVal(e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/*
          Attributes and Variations are sequential steps, so they share one
          card as tabs rather than competing for attention side by side.
          A simple product has no variations, so it gets no tab strip.
        */}
        <div className={isVariable ? "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" : shell}>
          {isVariable && (
            <Tabs
              tabs={[
                { id: "attributes", label: "Attributes", count: assignments.length },
                { id: "variations", label: "Variations", count: variations.length },
              ]}
              active={dataTab}
              onChange={(id) => setDataTab(id as "attributes" | "variations")}
            />
          )}

          <div className={isVariable ? "p-6" : ""}>
            {(!isVariable || dataTab === "attributes") && (
              <AttributeBuilder
                pool={builderPool}
                value={builderAssignments}
                onChange={(next) =>
                  // Preserve the config/required assignments (managed in the
                  // required card); the builder only owns the rest.
                  setAssignments([
                    ...assignments.filter((a) =>
                      requiredAttrIdSet.has(a.attribute_id)
                    ),
                    ...next,
                  ])
                }
                onPoolChange={reloadAttributes}
                notify={notify}
                isVariable={isVariable}
                productId={product.id}
              />
            )}

            {isVariable && dataTab === "variations" && (
              <VariationBuilder
                attributes={variationAttributes}
                value={variations}
                onChange={setVariations}
                notify={notify}
              />
            )}
          </div>
        </div>
        </div>

        <div className="space-y-6">
          <div className={shell}>
            <ImagePreview
              urls={images}
              error={fieldErrors.images}
              onChangeAt={setImageAt}
              onAdd={addImage}
              onRemove={removeImageFromPreview}
              onChoose={setPickerRow}
              onReorder={reorderImage}
              onDropFiles={handleDropFiles}
              uploadProgress={uploadProgress}
            />
            <MediaPicker
              isOpen={pickerRow !== null}
              onClose={() => setPickerRow(null)}
              onPick={(url) => {
                if (pickerRow !== null) setImageAt(pickerRow, url);
              }}
            />
            <p className="mt-2 text-theme-xs text-gray-400">
              Variation images aren’t shown here.
            </p>
          </div>

          {/* Media picker for required image-type attribute fields. */}
          <MediaPicker
            isOpen={reqPicker !== null}
            onClose={() => setReqPicker(null)}
            onPick={(url) => {
              if (reqPicker === null) return;
              setReqValues((v) => ({ ...v, [reqPicker]: url }));
              setReqErrors((er) => {
                const { [reqPicker]: _drop, ...rest } = er;
                return rest;
              });
            }}
          />

          <div className={shell}>
            <Model3DField
              value={form.model_3d_url}
              onChange={(v) => set("model_3d_url", v)}
              notify={notify}
            />
          </div>

          <div className={`${shell} space-y-5`}>
            <h3 className="font-medium text-gray-800 dark:text-white/90">Pricing</h3>
            {isVariable ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Prices for a variable product are computed from its variations
                by the database, so they can’t be edited here.
              </p>
            ) : (
              <>
                <div>
                  <Label>
                    Price (PHP) <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    error={!!fieldErrors.price}
                    hint={fieldErrors.price}
                  />
                </div>
                <div>
                  <Label>Sale price (PHP)</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={form.sale_price}
                    onChange={(e) => set("sale_price", e.target.value)}
                    error={!!fieldErrors.sale_price}
                    hint={fieldErrors.sale_price}
                  />
                </div>
              </>
            )}
          </div>

          <div className={`${shell} space-y-4`}>
            <h3 className="font-medium text-gray-800 dark:text-white/90">Status</h3>
            {(
              [
                ["published", "Published"],
                ["in_stock", "In stock"],
                ["featured", "Featured"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="w-5 h-5 rounded accent-brand-500"
                />
              </label>
            ))}
          </div>

          {formError && (
            <p className="text-sm text-error-500">{formError}</p>
          )}

          <div className="flex gap-3">
            <Button className="flex-1" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
