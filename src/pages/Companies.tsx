import { useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import MediaPicker from "../components/media/MediaPicker";
import ActivityDrawer from "../components/common/ActivityDrawer";
import RowMenu, { MenuItem, EditIconButton } from "../components/common/RowMenu";
import { Modal } from "../components/ui/modal";
import { ListToolbar, Pager } from "../components/common/ListControls";
import { useCompaniesFull } from "../hooks/useCompaniesFull";
import { useTableControls } from "../hooks/useTableControls";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  countCompanyBrands,
  createCompany,
  deleteCompany,
  updateCompany,
  validateCompany,
  uniqueCompanySlug,
  type CompanyInput,
} from "../lib/companies";
import type { CompanyFull } from "../types/catalogue";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

const EMPTY: CompanyInput = {
  name: "",
  slug: "",
  description: null,
  logo_url: null,
  position: 0,
};

export default function Companies() {
  const { companies, loading, error, reload } = useCompaniesFull();
  const { notify } = useToast();
  const { can, isAdmin } = useAuth();

  const [form, setForm] = useState<CompanyInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Company whose change history is open in the drawer, or null.
  const [activityCompany, setActivityCompany] = useState<CompanyFull | null>(
    null
  );

  const controls = useTableControls({
    rows: companies,
    searchFields: (c) => [c.name, c.slug, c.description],
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      slug: (a, b) => a.slug.localeCompare(b.slug),
      brands: (a, b) => (a.brand_count ?? 0) - (b.brand_count ?? 0),
      position: (a, b) => a.position - b.position,
    },
    initialSort: "name",
  });

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm(EMPTY);
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

  const startEdit = (c: CompanyFull) => {
    setEditingId(c.id);
    setFormError(null);
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description,
      logo_url: c.logo_url,
      position: c.position,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Slug is derived from the (unique) name and never shown. On create it's
    // made unique with a -1, -2… suffix; on edit the existing slug is kept so
    // brand slugs (company-slug/brand) don't drift.
    const name = form.name.trim();
    const slug = editingId
      ? form.slug
      : uniqueCompanySlug(name, companies);

    const payload: CompanyInput = {
      ...form,
      name,
      slug,
      description: form.description?.trim() || null,
      logo_url: form.logo_url?.trim() || null,
    };

    const problem = validateCompany(payload, companies, editingId ?? undefined);
    if (problem) {
      setFormError(problem);
      notify("error", "Check the form", problem);
      return;
    }

    setSaving(true);
    let error: string | null = null;
    if (editingId) {
      ({ error } = await updateCompany(editingId, payload));
    } else {
      ({ error } = await createCompany(payload));
    }
    setSaving(false);

    if (error) {
      setFormError(error);
      notify("error", editingId ? "Update failed" : "Create failed", error);
      return;
    }

    notify(
      "success",
      editingId ? "Company updated" : "Company created",
      payload.name
    );
    closeModal();
    reload();
  };

  const handleDelete = async (c: CompanyFull) => {
    const used = await countCompanyBrands(c.id);
    const msg =
      used > 0
        ? `Delete "${c.name}"? ${used} brand${
            used > 1 ? "s" : ""
          } will lose this company. Brands are not deleted.`
        : `Delete "${c.name}"?`;
    if (!window.confirm(msg)) return;

    const { error } = await deleteCompany(c.id);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Company deleted", c.name);
      if (editingId === c.id) resetForm();
      reload();
    }
  };

  return (
    <div>
      <PageMeta
        title="Companies | FusionEdge"
        description="Manage companies that own brands"
      />
      <PageBreadcrumb pageTitle="Companies" />

      <div className="space-y-6">
        <div className="flex justify-end">
          {can("company", "add") && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
          >
            + Add company
          </button>
          )}
        </div>

        {/* Create / edit form, in a modal */}
        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          className="max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        >
          <form onSubmit={handleSubmit}>
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {editingId ? "Edit company" : "Add company"}
            </h3>

            <div className="grid gap-5 sm:grid-cols-2">
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
                <Label>Position</Label>
                <Input
                  type="number"
                  value={String(form.position)}
                  onChange={(e) => set("position", Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="mt-5">
              <Label>Description</Label>
              <textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                className={`${inputClass} h-auto py-2.5`}
              />
            </div>

            <div className="mt-5">
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
                {saving ? "Saving…" : editingId ? "Save changes" : "Add company"}
              </button>
            </div>
          </form>
        </Modal>

        {/* List */}
        {loading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : error ? (
          <div className="p-6 border rounded-2xl border-error-500/30 bg-error-50 dark:bg-error-500/10">
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          </div>
        ) : companies.length === 0 ? (
          <div className={`${shell} text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No companies yet. Use “Add company” to create one.
            </p>
          </div>
        ) : (
          <>
            <ListToolbar
              query={controls.query}
              onQuery={controls.setQuery}
              placeholder="Search name or description"
              sortKey={controls.sortKey}
              onSortKey={controls.setSortKey}
              sortOptions={[
                { value: "name", label: "Name" },
                { value: "brands", label: "Brands" },
                { value: "position", label: "Position" },
              ]}
              dir={controls.dir}
              onToggleDir={controls.toggleDir}
              summary={
                controls.total === 0
                  ? "No matches"
                  : `${controls.rangeStart}–${controls.rangeEnd} of ${controls.total}`
              }
            />

            {controls.total === 0 ? (
              <div className={`${shell} text-center`}>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No company matches “{controls.query}”.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {controls.rows.map((c) => (
                  <div
                    key={c.id}
                    className={`${shell} flex flex-wrap items-center gap-4`}
                  >
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt={c.name}
                        className="object-contain w-12 h-12 rounded-lg shrink-0 bg-gray-50 dark:bg-white/[0.06]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 dark:bg-gray-800" />
                    )}

                    <div className="flex-1 min-w-40">
                      <Link
                        to={`/product/companies/${c.slug}`}
                        className="block font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                      >
                        {c.name}
                      </Link>
                      <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                        {c.brand_count} brand{c.brand_count === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/product/companies/${c.slug}`}
                        className="h-9 inline-flex items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                      >
                        Open
                      </Link>
                      {can("company", "edit") && (
                        <EditIconButton onClick={() => startEdit(c)} />
                      )}
                      {(isAdmin || can("company", "delete")) && (
                        <RowMenu>
                          {isAdmin && (
                            <MenuItem onClick={() => setActivityCompany(c)}>
                              {/* history */}
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3v5h5" />
                                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                                <path d="M12 7v5l3 3" />
                              </svg>
                              View activity
                            </MenuItem>
                          )}
                          {can("company", "delete") && (
                            <MenuItem danger onClick={() => handleDelete(c)}>
                              {/* trash */}
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                              Delete
                            </MenuItem>
                          )}
                        </RowMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Pager
              page={controls.page}
              pageCount={controls.pageCount}
              onPage={controls.setPage}
            />
          </>
        )}
      </div>

      <MediaPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => set("logo_url", url)}
      />

      {/* Per-company change history, in a right-side drawer. */}
      <ActivityDrawer
        table="companies"
        recordId={activityCompany?.id ?? null}
        title={activityCompany?.name}
        onClose={() => setActivityCompany(null)}
      />
    </div>
  );
}
