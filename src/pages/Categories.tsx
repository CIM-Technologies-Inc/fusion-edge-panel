import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import MediaPicker from "../components/media/MediaPicker";
import Badge from "../components/ui/badge/Badge";
import ActivityLog from "../components/common/ActivityLog";
import ActivityDrawer from "../components/common/ActivityDrawer";
import RowMenu, { MenuItem, EditIconButton } from "../components/common/RowMenu";
import { Modal } from "../components/ui/modal";
import { ListToolbar, Pager } from "../components/common/ListControls";
import { useCategoriesFull } from "../hooks/useCategoriesFull";
import { useTableControls } from "../hooks/useTableControls";
import {
  getRequiredAttributes,
  getComponents,
  hasComponents,
} from "../lib/requiredAttributes";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  countCategoryProducts,
  createCategory,
  deleteCategory,
  updateCategory,
  uniqueCategorySlug,
  validateCategory,
  type CategoryInput,
} from "../lib/categories";
import type { CategoryFull } from "../types/catalogue";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

const EMPTY: CategoryInput = {
  name: "",
  slug: "",
  parent_id: null,
  description: null,
  image_url: null,
  position: 0,
};

export default function Categories() {
  const { categories, loading, error, reload } = useCategoriesFull();
  const { notify } = useToast();
  const { can, isAdmin } = useAuth();

  const [form, setForm] = useState<CategoryInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  // Category whose change history is open in the drawer, or null.
  const [activityCat, setActivityCat] = useState<CategoryFull | null>(null);
  // Category whose required-attribute fields are shown in a modal, or null.
  const [reqCat, setReqCat] = useState<CategoryFull | null>(null);
  // Which section is selected in the required-fields drawer: "base" or a
  // component slug. Reset to "base" whenever the drawer opens on a category.
  const [reqView, setReqView] = useState<string>("base");

  const controls = useTableControls({
    rows: categories,
    searchFields: (c) => [c.name, c.slug, c.description],
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      slug: (a, b) => a.slug.localeCompare(b.slug),
      products: (a, b) => (a.product_count ?? 0) - (b.product_count ?? 0),
      position: (a, b) => a.position - b.position,
    },
    initialSort: "name",
  });

  const set = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
    setFormError(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    setShowActivity(false);
    resetForm();
  };

  const startAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const startEdit = (c: CategoryFull) => {
    setEditingId(c.id);
    setFormError(null);
    setForm({
      name: c.name,
      slug: c.slug,
      parent_id: c.parent_id,
      description: c.description,
      image_url: c.image_url,
      position: c.position,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Slug is auto-generated from the name (never shown). On create it's made
    // unique with a -1, -2… suffix; on edit the existing slug is kept.
    const name = form.name.trim();
    const slug = editingId
      ? form.slug
      : uniqueCategorySlug(name, categories);

    const payload: CategoryInput = {
      ...form,
      name,
      slug,
      description: form.description?.trim() || null,
      image_url: form.image_url?.trim() || null,
    };

    const problem = validateCategory(payload, categories, editingId ?? undefined);
    if (problem) {
      setFormError(problem);
      notify("error", "Check the form", problem);
      return;
    }

    setSaving(true);
    const { error } = editingId
      ? await updateCategory(editingId, payload)
      : await createCategory(payload);
    setSaving(false);

    if (error) {
      setFormError(error);
      notify("error", editingId ? "Update failed" : "Create failed", error);
      return;
    }

    notify(
      "success",
      editingId ? "Category updated" : "Category created",
      payload.name
    );
    closeModal();
    reload();
  };

  const handleDelete = async (c: CategoryFull) => {
    const used = await countCategoryProducts(c.id);
    // Can't delete a category that still has products assigned — reassign first.
    if (used > 0) {
      return notify(
        "error",
        "Can't delete this category",
        `"${c.name}" has ${used} product${
          used > 1 ? "s" : ""
        } assigned. Move ${used > 1 ? "them" : "it"} to another category first.`
      );
    }

    const children = categories.filter((x) => x.parent_id === c.id).length;
    const msg =
      children > 0
        ? `Delete "${c.name}"? ${children} sub-categor${
            children > 1 ? "ies" : "y"
          } will lose its parent.`
        : `Delete "${c.name}"?`;
    if (!window.confirm(msg)) return;

    const { error } = await deleteCategory(c.id);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Category deleted", c.name);
      if (editingId === c.id) resetForm();
      reload();
    }
  };

  const nameOf = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";

  return (
    <div>
      <PageMeta
        title="Categories | FusionEdge"
        description="Manage product categories"
      />
      <PageBreadcrumb pageTitle="Categories" />

      <div className="space-y-6">
        <div className="flex justify-end">
          {can("category", "add") && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
          >
            + Add category
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
              {editingId ? "Edit category" : "Add category"}
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
              <Label>Parent category</Label>
              <select
                value={form.parent_id ?? ""}
                onChange={(e) => set("parent_id", e.target.value || null)}
                className={`${inputClass} dark:bg-gray-900`}
              >
                <option value="">None (top level)</option>
                {categories
                  // A category can't be its own parent.
                  .filter((c) => c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
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
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              {form.image_url ? (
                <img
                  src={form.image_url}
                  alt="Category"
                  className="object-contain w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.06]"
                />
              ) : (
                <div className="flex items-center justify-center w-16 h-16 rounded-lg border border-dashed border-gray-300 text-theme-xs text-gray-400 dark:border-gray-700">
                  No image
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {form.image_url ? "Change image" : "Choose image"}
                </button>
                {form.image_url && (
                  <button
                    type="button"
                    onClick={() => set("image_url", null)}
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

          {/* Activity log for this category (admins, when editing). On demand. */}
          {editingId && isAdmin && (
            <div className="pt-5 mt-5 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowActivity((s) => !s)}
                className="text-sm font-medium text-brand-500 hover:text-brand-600"
              >
                {showActivity ? "Hide activity" : "View activity"}
              </button>
              {showActivity && (
                <div className="mt-3">
                  <ActivityLog
                    table="categories"
                    recordId={editingId}
                    limit={15}
                  />
                </div>
              )}
            </div>
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
                {saving
                  ? "Saving…"
                  : editingId
                  ? "Save changes"
                  : "Add category"}
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
        ) : categories.length === 0 ? (
          <div className={`${shell} text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No categories yet. Use “Add category” to create one.
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
                { value: "products", label: "Products" },
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
                  No category matches “{controls.query}”.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {controls.rows.map((c) => (
              <div
                key={c.id}
                className={`${shell} flex flex-wrap items-center gap-4`}
              >
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    className="object-cover w-12 h-12 rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 dark:bg-gray-800" />
                )}

                <div className="flex-1 min-w-40">
                  <span className="block font-medium text-gray-800 dark:text-white/90">
                    {c.name}
                  </span>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                    {c.parent_id
                      ? `Under ${nameOf(c.parent_id)}`
                      : "Top level"}
                  </span>
                </div>

                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {c.product_count} product{c.product_count === 1 ? "" : "s"}
                </span>

                {(hasComponents(c.slug) ||
                  getRequiredAttributes(c.slug).length > 0) && (
                  <button
                    type="button"
                    onClick={() => { setReqCat(c); setReqView("base"); }}
                    title="View components / required fields for this category"
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-theme-xs font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300"
                  >
                    {hasComponents(c.slug)
                      ? `${getComponents(c.slug).length} component${
                          getComponents(c.slug).length === 1 ? "" : "s"
                        }`
                      : `${getRequiredAttributes(c.slug).length} required field${
                          getRequiredAttributes(c.slug).length === 1 ? "" : "s"
                        }`}
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  {can("category", "edit") && (
                    <EditIconButton onClick={() => startEdit(c)} />
                  )}
                  {(isAdmin ||
                    can("category", "delete") ||
                    hasComponents(c.slug) ||
                    getRequiredAttributes(c.slug).length > 0) && (
                    <RowMenu>
                      {(hasComponents(c.slug) ||
                        getRequiredAttributes(c.slug).length > 0) && (
                        <MenuItem onClick={() => { setReqCat(c); setReqView("base"); }}>
                          {/* list */}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                          </svg>
                          {hasComponents(c.slug)
                            ? "Components & fields"
                            : "Required fields"}
                        </MenuItem>
                      )}
                      {isAdmin && (
                        <MenuItem onClick={() => setActivityCat(c)}>
                          {/* history */}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3v5h5" />
                            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                            <path d="M12 7v5l3 3" />
                          </svg>
                          View activity
                        </MenuItem>
                      )}
                      {can("category", "delete") && (
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
        onPick={(url) => set("image_url", url)}
      />

      {/* Per-category change history, in a right-side drawer. */}
      <ActivityDrawer
        table="categories"
        recordId={activityCat?.id ?? null}
        title={activityCat?.name}
        onClose={() => setActivityCat(null)}
      />

      {/* Components / required fields — right-side drawer. */}
      {reqCat && (
        <>
          <div
            className="fixed inset-0 z-[99999] bg-gray-900/40 backdrop-blur-[1px]"
            onClick={() => setReqCat(null)}
          />
          <aside
            className="fixed right-0 top-0 z-[100000] flex h-screen w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
            role="dialog"
            aria-label="Required fields"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {hasComponents(reqCat.slug)
                    ? "Components & required fields"
                    : "Required fields"}
                </h3>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {reqCat.name} —{" "}
                  {hasComponents(reqCat.slug)
                    ? "pick a component on the product form"
                    : "fields a product must fill in"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReqCat(null)}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {hasComponents(reqCat.slug) ? (
              // Two-pane: a component sidebar + the selected one's fields.
              <div className="flex min-h-0 flex-1">
                {/* Sidebar: Base + each component. */}
                <nav className="w-40 shrink-0 overflow-y-auto border-r border-gray-100 py-2 dark:border-gray-800">
                  {[
                    { slug: "base", label: "Base fields" },
                    ...getComponents(reqCat.slug),
                  ].map((item) => {
                    const count = getRequiredAttributes(
                      reqCat.slug,
                      item.slug === "base" ? null : item.slug
                    ).length;
                    const active = reqView === item.slug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => setReqView(item.slug)}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-theme-sm ${
                          active
                            ? "border-l-2 border-brand-500 bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                            : "border-l-2 border-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 text-theme-xs ${
                            active
                              ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"
                              : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                {/* Fields for the selected section. */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                    {reqView === "base"
                      ? "Base fields"
                      : getComponents(reqCat.slug).find(
                          (c) => c.slug === reqView
                        )?.label ?? reqView}
                    {reqView === "base" && (
                      <span className="ml-2 text-theme-xs font-normal text-gray-400">
                        (no component chosen)
                      </span>
                    )}
                  </h4>
                  <FieldList
                    attrs={getRequiredAttributes(
                      reqCat.slug,
                      reqView === "base" ? null : reqView
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <FieldList attrs={getRequiredAttributes(reqCat.slug)} />
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

/** Badge color per field type, so types read at a glance. */
const TYPE_COLOR: Record<
  string,
  "primary" | "success" | "warning" | "info" | "light"
> = {
  text: "light",
  number: "info",
  url: "info",
  color: "primary",
  image: "primary",
  rfa: "warning",
  boolean: "success",
  select: "success",
};

/** Render a list of required-attribute fields with their meta + type badge. */
function FieldList({
  attrs,
}: {
  attrs: ReturnType<typeof getRequiredAttributes>;
}) {
  if (attrs.length === 0)
    return (
      <p className="text-theme-xs text-gray-400">No fields configured.</p>
    );
  const requiredCount = attrs.filter((a) => a.required).length;
  return (
    <>
      {/* Summary: total, required, optional. */}
      <p className="mb-3 text-theme-xs text-gray-400">
        {attrs.length} field{attrs.length === 1 ? "" : "s"} · {requiredCount}{" "}
        required · {attrs.length - requiredCount} optional
      </p>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {attrs.map((ra) => (
          <li
            key={ra.name}
            className="flex items-start justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {ra.label}
                </p>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-theme-xs font-medium ${
                    ra.required
                      ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"
                      : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                  }`}
                >
                  {ra.required ? "required" : "optional"}
                </span>
                {ra.disabled && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-theme-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
                    locked
                  </span>
                )}
              </div>
              <p className="mt-0.5 break-all font-mono text-theme-xs text-gray-400">
                {ra.name}
              </p>
              {ra.default && (
                <p className="text-theme-xs text-gray-400">
                  default: {ra.default}
                </p>
              )}
              {ra.options && ra.options.length > 0 && (
                <p className="text-theme-xs text-gray-400">
                  options: {ra.options.join(", ")}
                </p>
              )}
            </div>
            <Badge size="sm" color={TYPE_COLOR[ra.type] ?? "light"}>
              {ra.type}
            </Badge>
          </li>
        ))}
      </ul>
    </>
  );
}
