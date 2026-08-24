import { useState } from "react";
import { Link, useNavigate } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Button from "../components/ui/button/Button";
import RichTextEditor from "../components/form/RichTextEditor";
import AttributeBuilder, {
  type PendingTerm,
} from "../components/product/AttributeBuilder";
import ImagePreview from "../components/product/ImagePreview";
import Model3DField from "../components/product/Model3DField";
import MediaPicker from "../components/media/MediaPicker";
import { useToast } from "../context/ToastContext";
import { useCategories } from "../hooks/useCategories";
import { useCompanyBrands } from "../hooks/useCompanyBrands";
import { useAttributes } from "../hooks/useAttributes";
import { uploadFileWithProgress } from "../lib/media";
import { inputToCents } from "../lib/price";
import {
  createProduct,
  slugify,
  validateFields,
  type FieldErrors,
  type ProductCreate,
} from "../lib/products";
import {
  createTerm,
  resolveRequiredAssignments,
  syncProductAttributes,
  type AttributeAssignment,
} from "../lib/attributes";
import { getRequiredAttributes } from "../lib/requiredAttributes";
import type { AttributeWithTerms, ProductKind } from "../types/catalogue";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

export default function ProductNew() {
  const { categories } = useCategories();
  const { companies, brandsByCompany } = useCompanyBrands();
  const { attributes, reload: reloadAttributes } = useAttributes();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AttributeAssignment[]>([]);
  // Values typed on this page before the product exists. Held locally and
  // written as product-owned (private) values once the product is created —
  // never into the global pool. See AttributeBuilder's deferred path.
  const [pendingTerms, setPendingTerms] = useState<PendingTerm[]>([]);

  // The pool the builder sees: the global attributes plus any pending values,
  // grafted onto their attribute so their chips render and stay selectable.
  const poolWithPending: AttributeWithTerms[] = attributes.map((a) => {
    const extra = pendingTerms.filter((t) => t.attribute_id === a.id);
    if (extra.length === 0) return a;
    return {
      ...a,
      terms: [
        ...a.terms,
        ...extra.map((t, i) => ({
          id: t.tempId,
          name: t.name,
          slug: t.name,
          swatch: t.swatch,
          position: a.terms.length + i,
        })),
      ],
    };
  });
  // Which image row the media picker is filling, or null when closed.
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [kind, setKind] = useState<ProductKind>("simple");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [brandId, setBrandId] = useState("");
  // Brands available for the chosen company (the picker filters by company).
  const companyBrands = companyId ? brandsByCompany.get(companyId) ?? [] : [];

  // Category-required attributes (from requiredAttributes.json), matched by the
  // selected category's slug. Auto-shown as fields; their typed values.
  const categorySlug =
    categories.find((c) => c.id === categoryId)?.slug ?? null;
  const requiredAttrs = getRequiredAttributes(categorySlug);
  // Config attributes are managed only in the required card — keep them out of
  // the regular Attributes list so they don't appear twice. Matched by slug.
  const requiredSlugSet = new Set(requiredAttrs.map((ra) => slugify(ra.name)));
  const builderPool = poolWithPending.filter(
    (a) => !requiredSlugSet.has(a.slug)
  );
  // name -> typed value, and name -> error message
  const [reqValues, setReqValues] = useState<Record<string, string>>({});
  const [reqErrors, setReqErrors] = useState<Record<string, string>>({});
  // Which required-image field the media picker is filling, or null.
  const [reqPicker, setReqPicker] = useState<string | null>(null);
  const [shortDesc, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [images, setImages] = useState<string[]>([""]);
  const [model3d, setModel3d] = useState("");
  const [published, setPublished] = useState(false);
  const [inStock, setInStock] = useState(true);
  const [featured, setFeatured] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Only show field errors after the first submit attempt.
  const [submitted, setSubmitted] = useState(false);

  // Once submitted, keep field errors live so they clear as the user fixes.
  const revalidate = (over: Partial<{
    name: string;
    slug: string;
    price: string;
    salePrice: string;
    images: string[];
    categoryId: string;
    companyId: string;
    brandId: string;
  }>) => {
    if (!submitted) return;
    const p = inputToCents(over.price ?? price);
    const s = inputToCents(over.salePrice ?? salePrice);
    // Variable products price via their variations — never flag the fields.
    const variable = kind === "variable";
    setFieldErrors(
      validateFields({
        name: over.name ?? name,
        slug: over.slug ?? slug,
        kind,
        price_cents: variable ? null : Number.isNaN(p) ? null : p,
        sale_price_cents: variable ? null : Number.isNaN(s) ? null : s,
        image_urls: (over.images ?? images).map((u) => u.trim()).filter(Boolean),
        category_id: over.categoryId ?? categoryId,
        company_id: over.companyId ?? companyId,
        brand_id: over.brandId ?? brandId,
      })
    );
  };

  // Auto-fill the slug from the name until the user edits the slug directly.
  const onName = (v: string) => {
    setName(v);
    const nextSlug = slugEdited ? slug : slugify(v);
    if (!slugEdited) setSlug(nextSlug);
    revalidate({ name: v, slug: nextSlug });
  };

  const setImageAt = (i: number, v: string) =>
    setImages((list) => list.map((u, idx) => (idx === i ? v : u)));
  const addImage = () => setImages((list) => [...list, ""]);
  /** Move image at index `from` to `to`, reindexing the rest (drag reorder).
   *  Reordering can't change validity (same URLs), so no revalidate needed. */
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
      revalidate({ images: next });
      return next;
    });
    notify("success", "Image added", `${urls.length} uploaded.`);
  };
  /**
   * Remove from the preview. Unlike the row's Remove button this also clears
   * the last remaining row rather than leaving its URL in place, and keeps
   * validation in step.
   */
  const removeImageFromPreview = (i: number) => {
    const next =
      images.length > 1
        ? images.filter((_, idx) => idx !== i)
        : images.map((u, idx) => (idx === i ? "" : u));
    setImages(next);
    revalidate({ images: next });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitted(true);

    const priceCents = inputToCents(price);
    const saleCents = inputToCents(salePrice);
    if (Number.isNaN(priceCents) || Number.isNaN(saleCents)) {
      setFieldErrors({ price: "Prices must be valid numbers." });
      notify("error", "Check the form", "Prices must be valid numbers.");
      return;
    }

    const descHtml = description.trim();
    const descEmpty = descHtml === "" || descHtml === "<p></p>";
    const imageUrls = images.map((u) => u.trim()).filter(Boolean);

    // A variable product's prices come from its variations, so ignore
    // anything left in the price fields from before the type was switched.
    const isVariable = kind === "variable";
    const effectivePrice = isVariable ? null : priceCents;
    const effectiveSale = isVariable ? null : saleCents;

    const errors = validateFields({
      name,
      slug,
      kind,
      price_cents: effectivePrice,
      sale_price_cents: effectiveSale,
      image_urls: imageUrls,
      category_id: categoryId,
      company_id: companyId,
      brand_id: brandId,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify("error", "Check the form", "Some fields need attention.");
      return;
    }

    // Category-required attributes must be filled in.
    const reqErr: Record<string, string> = {};
    for (const ra of requiredAttrs) {
      if (ra.required && !(reqValues[ra.name] ?? ra.default ?? "").trim())
        reqErr[ra.name] = `${ra.label} is required.`;
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

    // An attribute with no values would be silently dropped on save — block it.
    const emptyAttr = assignments.find((a) => a.term_ids.length === 0);
    if (emptyAttr) {
      const attrName =
        attributes.find((p) => p.id === emptyAttr.attribute_id)?.name ??
        "An attribute";
      const msg = `${attrName} has no values selected. Pick at least one value or remove it.`;
      notify("error", "Check the attributes", msg);
      return;
    }

    const create: ProductCreate = {
      kind,
      name: name.trim(),
      slug: slug.trim(),
      sku: sku.trim() || null,
      category_id: categoryId || null,
      brand_id: brandId || null,
      company_id: companyId || null,
      model_3d_url: model3d.trim() || null,
      short_description: shortDesc.trim() || null,
      description: descEmpty ? null : descHtml,
      price_cents: effectivePrice,
      sale_price_cents: effectiveSale,
      in_stock: inStock,
      featured,
      published,
      image_urls: imageUrls,
    };

    setSaving(true);
    const { error, slug: newSlug, id } = await createProduct(create);

    if (error || !id) {
      setSaving(false);
      setError(error);
      notify("error", "Could not create product", error ?? "Failed.");
      return;
    }

    // Product row is in. Now persist any values that were typed before the
    // product existed — as product-owned (private) values, not global — and
    // map their temporary ids to the real ones.
    const tempToReal = new Map<string, string>();
    for (const t of pendingTerms) {
      const { data, error: termErr } = await createTerm(
        t.attribute_id,
        t.name,
        t.swatch,
        id
      );
      if (termErr || !data) {
        setSaving(false);
        notify("error", "Product saved, values failed", termErr ?? "Failed.");
        navigate(`/product/${newSlug}`);
        return;
      }
      tempToReal.set(t.tempId, data.id);
    }

    // Swap any temp ids in the assignments (selected terms + default) for the
    // now-real ids before writing the attribute links.
    const resolveId = (tid: string) => tempToReal.get(tid) ?? tid;
    const resolved = assignments.map((a) => ({
      ...a,
      term_ids: a.term_ids.map(resolveId),
      default_term_id: a.default_term_id ? resolveId(a.default_term_id) : a.default_term_id,
    }));

    // Category-required attributes: create/find the attribute + a product-owned
    // term for each typed value, and merge them in as (spec) assignments.
    let requiredAssignments: AttributeAssignment[] = [];
    if (requiredAttrs.length > 0) {
      const filled = requiredAttrs.map((ra) => ({
        name: ra.name,
        value: reqValues[ra.name] ?? ra.default ?? "",
      }));
      const res = await resolveRequiredAssignments(id, filled);
      if (res.error) {
        setSaving(false);
        notify("error", "Product saved, required attrs failed", res.error);
        navigate(`/product/${newSlug}`);
        return;
      }
      requiredAssignments = res.assignments;
    }

    // A simple product can never carry variation attributes — force specs.
    const safeAssignments = [
      ...(kind === "variable"
        ? resolved
        : resolved.map((a) => ({ ...a, used_for_variations: false }))),
      ...requiredAssignments, // always specs
    ];

    if (safeAssignments.length > 0) {
      const { error: attrErr } = await syncProductAttributes(
        id,
        safeAssignments
      );
      if (attrErr) {
        setSaving(false);
        notify(
          "error",
          "Product saved, attributes failed",
          attrErr
        );
        navigate(`/product/${newSlug}`);
        return;
      }
    }
    setSaving(false);

    notify("success", "Product created", `${create.name} was added.`);
    navigate(`/product/${newSlug}`);
  }

  return (
    <div>
      <PageMeta title="New product | FusionEdge" description="Add a product" />
      <PageBreadcrumb pageTitle="New product" />

      <div className="mb-5">
        <Link
          to="/product"
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          ← Back to products
        </Link>
      </div>

      {/* Kind selector — simple works now; variable is coming. */}
      <div className={`${shell} mb-6`}>
        <Label>Product type</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setKind("simple")}
            className={`rounded-xl border p-4 text-left transition ${
              kind === "simple"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
            }`}
          >
            <span className="block font-medium text-gray-800 dark:text-white/90">
              Simple
            </span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              One product, one price.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setKind("variable")}
            className={`rounded-xl border p-4 text-left transition ${
              kind === "variable"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
            }`}
          >
            <span className="block font-medium text-gray-800 dark:text-white/90">
              Variable
            </span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              Options like Color &amp; Size, each with its own price.
            </span>
          </button>
        </div>
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
              value={name}
              onChange={(e) => onName(e.target.value)}
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
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                  revalidate({ slug: e.target.value });
                }}
                error={!!fieldErrors.slug}
                hint={fieldErrors.slug}
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>
                Category <span className="text-error-500">*</span>
              </Label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  revalidate({ categoryId: e.target.value });
                }}
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
                value={companyId}
                onChange={(e) => {
                  const cid = e.target.value;
                  setCompanyId(cid);
                  // Company drives the brand list, so a company change clears a
                  // brand that no longer belongs to the new company.
                  const allowed = cid ? brandsByCompany.get(cid) ?? [] : [];
                  const keepBrand = allowed.some((b) => b.id === brandId)
                    ? brandId
                    : "";
                  setBrandId(keepBrand);
                  revalidate({ companyId: cid, brandId: keepBrand });
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
                value={brandId}
                disabled={!companyId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  revalidate({ brandId: e.target.value });
                }}
                className={`${inputClass} dark:bg-gray-900 disabled:opacity-50 ${
                  fieldErrors.brand
                    ? "border-error-500 focus:border-error-300 focus:ring-error-500/20"
                    : ""
                }`}
              >
                <option value="">
                  {companyId
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
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              className={`${inputClass} h-auto py-2.5`}
            />
          </div>
          <div>
            <Label>Description</Label>
            <RichTextEditor value={description} onChange={setDescription} />
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
                {categories.find((c) => c.id === categoryId)?.name}.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {requiredAttrs.map((ra) => {
                const val = reqValues[ra.name] ?? ra.default ?? "";
                const setVal = (next: string) => {
                  setReqValues((v) => ({ ...v, [ra.name]: next }));
                  setReqErrors((er) => {
                    const { [ra.name]: _drop, ...rest } = er;
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
                          error={!!reqErrors[ra.name]}
                          hint={reqErrors[ra.name]}
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
                          error={!!reqErrors[ra.name]}
                          hint={reqErrors[ra.name]}
                          onChange={(e) => setVal(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setReqPicker(ra.name)}
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
                        error={!!reqErrors[ra.name]}
                        hint={reqErrors[ra.name]}
                        onChange={(e) => setVal(e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attributes get their own card, separate from the product details. */}
        <div className={shell}>
          <AttributeBuilder
            pool={builderPool}
            value={assignments}
            onChange={setAssignments}
            onPoolChange={reloadAttributes}
            notify={notify}
            isVariable={kind === "variable"}
            onPendingTerm={(t) => setPendingTerms((list) => [...list, t])}
            onEditPendingTerm={(tempId, patch) =>
              setPendingTerms((list) =>
                list.map((t) =>
                  t.tempId === tempId ? { ...t, ...patch } : t
                )
              )
            }
          />
          {kind === "variable" && (
            <p className="pt-4 mt-4 text-theme-xs text-gray-400 border-t border-gray-100 dark:border-gray-800">
              Variations are set up after the product is created — pick the
              attributes and values here, then use the Variations tab on the
              edit page.
            </p>
          )}
        </div>
        </div>

        <div className="space-y-6">
          <div className={shell}>
            <ImagePreview
              urls={images}
              error={fieldErrors.images}
              onChangeAt={(i, v) => {
                setImageAt(i, v);
                const next = images.map((u, idx) => (idx === i ? v : u));
                revalidate({ images: next });
              }}
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
                if (pickerRow === null) return;
                setImageAt(pickerRow, url);
                const next = images.map((u, idx) =>
                  idx === pickerRow ? url : u
                );
                revalidate({ images: next });
              }}
            />
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
            <Model3DField value={model3d} onChange={setModel3d} notify={notify} />
          </div>

          <div className={`${shell} space-y-5`}>
            <h3 className="font-medium text-gray-800 dark:text-white/90">Pricing</h3>
            {kind === "variable" ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                A variable product’s price range is calculated from its
                variations. Create the product, then add variations on the edit
                page to set their prices.
              </p>
            ) : (
              <>
            <div>
              <Label>
                Price (USD) <span className="text-error-500">*</span>
              </Label>
              <Input
                type="number"
                step={0.01}
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  revalidate({ price: e.target.value });
                }}
                error={!!fieldErrors.price}
                hint={fieldErrors.price}
              />
            </div>
            <div>
              <Label>Sale price (USD)</Label>
              <Input
                type="number"
                step={0.01}
                value={salePrice}
                onChange={(e) => {
                  setSalePrice(e.target.value);
                  revalidate({ salePrice: e.target.value });
                }}
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
                ["published", published, setPublished, "Published"],
                ["in_stock", inStock, setInStock, "In stock"],
                ["featured", featured, setFeatured, "Featured"],
              ] as const
            ).map(([key, val, setter, label]) => (
              <label
                key={key}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => setter(e.target.checked)}
                  className="w-5 h-5 rounded accent-brand-500"
                />
              </label>
            ))}
            <p className="text-theme-xs text-gray-400">
              New products are unpublished by default — tick Published to make it
              live.
            </p>
          </div>

          {error && <p className="text-sm text-error-500">{error}</p>}

          <Button className="w-full" size="sm" disabled={saving}>
            {saving ? "Creating…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
