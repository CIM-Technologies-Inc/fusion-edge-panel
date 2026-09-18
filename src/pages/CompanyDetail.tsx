import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import MediaPicker from "../components/media/MediaPicker";
import { Modal } from "../components/ui/modal";
import { useCompaniesFull } from "../hooks/useCompaniesFull";
import { useBrandsFull } from "../hooks/useBrandsFull";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  countBrandProducts,
  createBrand,
  deleteBrand,
  updateBrand,
  validateBrand,
  slugify,
  type BrandInput,
} from "../lib/brands";
import type { BrandFull, CompanyFull } from "../types/catalogue";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

/** Short, local date like "Sep 9, 2026". Blank when there's no timestamp. */
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const EMPTY: BrandInput = {
  name: "",
  slug: "",
  description: null,
  logo_url: null,
  position: 0,
  company_id: null,
};

export default function CompanyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { companies, loading: companiesLoading } = useCompaniesFull();
  const { brands, loading: brandsLoading, reload } = useBrandsFull();
  const { notify } = useToast();
  const { can, isAdmin, companyId } = useAuth();

  const company: CompanyFull | undefined = useMemo(
    () => companies.find((c) => c.slug === slug),
    [companies, slug]
  );

  // Who may manage this company's brands: admins and no-company staff (they
  // manage every company, gated by their brand permission); a company user only
  // on their OWN company.
  const canManageBrands = isAdmin || !companyId || company?.id === companyId;

  // Only this company's brands (owned by it).
  const companyBrands = useMemo(
    () => brands.filter((b) => b.company_id === company?.id),
    [brands, company?.id]
  );

  const [form, setForm] = useState<BrandInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const set = <K extends keyof BrandInput>(k: K, v: BrandInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({ ...EMPTY, company_id: company?.id ?? null });
    setEditingId(null);
    setFormError(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const startAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const startEdit = (b: BrandFull) => {
    setEditingId(b.id);
    setFormError(null);
    setForm({
      name: b.name,
      slug: b.slug,
      description: b.description,
      logo_url: b.logo_url,
      position: b.position,
      company_id: b.company_id ?? company?.id ?? null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setFormError(null);

    // Slug is auto-generated as "<company-slug>/<brand-name>" — never shown.
    const slugValue = `${company.slug}/${slugify(form.name)}`;

    const payload: BrandInput = {
      ...form,
      name: form.name.trim(),
      slug: slugValue,
      description: form.description?.trim() || null,
      logo_url: form.logo_url?.trim() || null,
      company_id: company.id,
    };

    const problem = validateBrand(payload, brands, editingId ?? undefined);
    if (problem) {
      setFormError(problem);
      notify("error", "Check the form", problem);
      return;
    }

    setSaving(true);
    const { error } = editingId
      ? await updateBrand(editingId, payload)
      : await createBrand(payload);
    setSaving(false);

    if (error) {
      setFormError(error);
      notify("error", editingId ? "Update failed" : "Create failed", error);
      return;
    }

    notify(
      "success",
      editingId ? "Brand updated" : "Brand created",
      payload.name
    );
    closeModal();
    reload();
  };

  const handleDelete = async (b: BrandFull) => {
    const used = await countBrandProducts(b.id);
    // Can't delete a brand that still has products assigned — reassign first.
    if (used > 0) {
      return notify(
        "error",
        "Can't delete this brand",
        `"${b.name}" has ${used} product${
          used > 1 ? "s" : ""
        } assigned. Move ${used > 1 ? "them" : "it"} to another brand first.`
      );
    }
    if (!window.confirm(`Delete "${b.name}"?`)) return;

    const { error } = await deleteBrand(b.id);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Brand deleted", b.name);
      reload();
    }
  };

  if (companiesLoading) {
    return (
      <div className={shell}>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Company" />
        <div className={`${shell} text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Company not found.{" "}
            <Link to="/product/companies" className="text-brand-500">
              Back to companies
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title={`${company.name} | FusionEdge`}
        description={`Brands and details for ${company.name}`}
      />
      <PageBreadcrumb pageTitle={company.name} />

      <div className="space-y-6">
        <Link
          to="/product/companies"
          className="inline-flex items-center text-sm text-gray-500 hover:text-brand-500 dark:text-gray-400"
        >
          ← All companies
        </Link>

        {/* Company header / landing card */}
        <div className={`${shell} flex flex-wrap items-center gap-5`}>
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="object-contain w-20 h-20 rounded-xl shrink-0 bg-gray-50 dark:bg-white/[0.06]"
            />
          ) : (
            <div className="flex items-center justify-center w-20 h-20 text-2xl font-semibold text-gray-400 rounded-xl bg-gray-100 shrink-0 dark:bg-gray-800">
              {company.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-48">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {company.name}
            </h2>
            {company.description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {company.description}
              </p>
            )}
            <p className="mt-2 text-theme-xs text-gray-400">
              {companyBrands.length} brand
              {companyBrands.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Brands section */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Brands
          </h3>
          {canManageBrands && can("brand", "add") && (
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
            >
              + Add brand
            </button>
          )}
        </div>

        {brandsLoading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : companyBrands.length === 0 ? (
          <div className={`${shell} text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No brands for {company.name} yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {companyBrands.map((b) => (
              <div
                key={b.id}
                className={`${shell} flex flex-wrap items-center gap-4`}
              >
                {b.logo_url ? (
                  <img
                    src={b.logo_url}
                    alt={b.name}
                    className="object-contain w-12 h-12 rounded-lg shrink-0 bg-gray-50 dark:bg-white/[0.06]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 dark:bg-gray-800" />
                )}

                <div className="flex-1 min-w-40">
                  <span className="block font-medium text-gray-800 dark:text-white/90">
                    {b.name}
                  </span>
                  <span className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {b.product_count} product{b.product_count === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-theme-xs text-gray-400 sm:items-end">
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={`Created ${fmtDate(b.created_at)}`}
                  >
                    {/* calendar-plus icon */}
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
                    </svg>
                    Added {fmtDate(b.created_at)}
                  </span>
                  {b.updated_at && b.updated_at !== b.created_at && (
                    <span
                      className="inline-flex items-center gap-1.5"
                      title={`Last updated ${fmtDate(b.updated_at)}`}
                    >
                      {/* refresh icon */}
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        <path d="M3 21v-5h5" />
                      </svg>
                      Updated {fmtDate(b.updated_at)}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {canManageBrands && can("brand", "edit") && (
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                    >
                      Edit
                    </button>
                  )}
                  {canManageBrands && can("brand", "delete") && (
                    <button
                      type="button"
                      onClick={() => handleDelete(b)}
                      className="h-9 px-3 text-sm text-gray-400 rounded-lg hover:text-error-500"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / edit brand modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        className="max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={handleSubmit}>
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingId ? "Edit brand" : `Add brand to ${company.name}`}
          </h3>

          <div className="space-y-5">
            <div>
              <Label>
                Name <span className="text-error-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                className={`${inputClass} h-auto py-2.5`}
              />
            </div>

            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="object-contain w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.06]"
                  />
                ) : (
                  <div className="flex items-center justify-center w-16 h-16 rounded-lg border border-dashed border-gray-300 text-theme-xs text-gray-400 dark:border-gray-700">
                    No logo
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  >
                    {form.logo_url ? "Change logo" : "Choose logo"}
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => set("logo_url", null)}
                      className="h-11 rounded-lg px-3 text-sm font-medium text-gray-400 hover:text-error-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {formError && (
            <p className="mt-4 text-sm text-error-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={closeModal}
              className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add brand"}
            </button>
          </div>
        </form>
      </Modal>

      <MediaPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => set("logo_url", url)}
      />
    </div>
  );
}
