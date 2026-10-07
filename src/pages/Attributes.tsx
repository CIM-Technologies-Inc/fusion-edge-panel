import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Badge from "../components/ui/badge/Badge";
import MediaPicker from "../components/media/MediaPicker";
import { Modal } from "../components/ui/modal";
import { ListToolbar, Pager } from "../components/common/ListControls";
import { useAttributes } from "../hooks/useAttributes";
import { useTableControls } from "../hooks/useTableControls";
import { useToast } from "../context/ToastContext";
import {
  countAttributeUsage,
  createAttribute,
  createTerm,
  deleteAttribute,
  deleteTerm,
  updateAttribute,
  updateTerm,
} from "../lib/attributes";
import type { AttributeWithTerms, DisplayType } from "../types/catalogue";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

const TYPE_LABEL: Record<DisplayType, string> = {
  select: "Dropdown",
  button: "Button",
  color: "Color swatch",
  image: "Image",
};

export default function Attributes() {
  const { attributes, loading, reload } = useAttributes();
  const { notify } = useToast();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DisplayType>("select");
  const [newFilterable, setNewFilterable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  /** Attribute being edited in the modal, or null when adding a new one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Term being edited in the modal: its id, draft values, and the parent
   *  attribute's display type so the modal shows the right controls. */
  const [editTerm, setEditTerm] = useState<{
    id: string;
    name: string;
    swatch: string;
    type: DisplayType;
  } | null>(null);
  /** True while the media picker is open FOR the value-edit modal. */
  const [editTermPicker, setEditTermPicker] = useState(false);

  // Per-attribute "add value" drafts.
  const [termDraft, setTermDraft] = useState<Record<string, string>>({});
  const [swatchDraft, setSwatchDraft] = useState<Record<string, string>>({});
  const [imageDraft, setImageDraft] = useState<Record<string, string>>({});
  const [pickerAttr, setPickerAttr] = useState<string | null>(null);

  const controls = useTableControls({
    rows: attributes,
    // Searching term names too, so "oak" finds the Color attribute.
    searchFields: (a) => [a.name, a.slug, ...a.terms.map((t) => t.name)],
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      type: (a, b) => a.display_type.localeCompare(b.display_type),
      values: (a, b) => a.terms.length - b.terms.length,
    },
    initialSort: "name",
    pageSize: 5,
  });

  const openAdd = () => {
    setEditingId(null);
    setNewName("");
    setNewType("select");
    setNewFilterable(false);
    setModalOpen(true);
  };

  const openEdit = (attr: AttributeWithTerms) => {
    setEditingId(attr.id);
    setNewName(attr.name);
    setNewType(attr.display_type);
    setNewFilterable(!!attr.filterable);
    setModalOpen(true);
  };

  /** Saves the modal — creating a new attribute or updating the edited one. */
  const handleSaveAttribute = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { error } = editingId
      ? await updateAttribute(editingId, newName, newType, newFilterable)
      : await createAttribute(newName, newType, newFilterable);
    setCreating(false);

    if (error) {
      notify(
        "error",
        editingId ? "Could not update attribute" : "Could not create attribute",
        error
      );
      return;
    }
    notify(
      "success",
      editingId ? "Attribute updated" : "Attribute created",
      newName.trim()
    );
    setNewName("");
    setNewType("select");
    setEditingId(null);
    setModalOpen(false);
    reload();
  };

  const handleSaveTerm = async () => {
    if (!editTerm || !editTerm.name.trim()) return;

    // Image values must carry a usable URL in the swatch column.
    if (editTerm.type === "image") {
      const url = editTerm.swatch.trim();
      if (!url) {
        notify("error", "Image required", "Choose or paste an image URL.");
        return;
      }
      if (!/^https?:\/\/|^\//.test(url)) {
        notify("error", "Bad image URL", "URL must start with http(s):// or /.");
        return;
      }
    }

    const { error } = await updateTerm(
      editTerm.id,
      editTerm.name,
      editTerm.swatch.trim() || null
    );
    if (error) {
      notify("error", "Could not update value", error);
      return;
    }
    setEditTerm(null);
    reload();
  };

  const handleAddTerm = async (attr: AttributeWithTerms) => {
    const name = (termDraft[attr.id] ?? "").trim();
    if (!name) return;

    let swatch: string | null = null;
    if (attr.display_type === "color") {
      swatch = swatchDraft[attr.id] ?? "#000000";
    } else if (attr.display_type === "image") {
      const url = (imageDraft[attr.id] ?? "").trim();
      if (!url) {
        notify("error", "Image URL required", "Add an image URL for this value.");
        return;
      }
      swatch = url;
    }

    const { error } = await createTerm(attr.id, name, swatch);
    if (error) {
      notify("error", "Could not add value", error);
      return;
    }
    setTermDraft((d) => ({ ...d, [attr.id]: "" }));
    setImageDraft((d) => ({ ...d, [attr.id]: "" }));
    reload();
  };

  const handleDeleteTerm = async (termId: string, name: string) => {
    if (!window.confirm(`Delete the value "${name}"?`)) return;
    const { error } = await deleteTerm(termId);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Value deleted", name);
      reload();
    }
  };

  const handleDeleteAttribute = async (attr: AttributeWithTerms) => {
    const uses = await countAttributeUsage(attr.id);
    const warning =
      uses > 0
        ? `"${attr.name}" is used by ${uses} product${uses > 1 ? "s" : ""}. ` +
          `Deleting it removes it from those products too. Continue?`
        : `Delete "${attr.name}" and all its values?`;
    if (!window.confirm(warning)) return;

    const { error } = await deleteAttribute(attr.id);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Attribute deleted", attr.name);
      reload();
    }
  };

  const inputClass =
    "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  return (
    <div>
      <PageMeta
        title="Attributes | FusionEdge"
        description="Manage global product attributes"
      />
      <PageBreadcrumb pageTitle="Attributes" />

      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
          >
            + Add attribute
          </button>
        </div>

        {/* Create a new global attribute */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          className="max-w-lg w-full p-6"
        >
          <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingId ? "Edit attribute" : "Add attribute"}
          </h3>
          <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            {editingId
              ? "Renaming affects every product using this attribute. Its slug stays the same."
              : "Attributes are global — define Color or Material once and reuse it on any product."}
          </p>
          <div className="space-y-5">
            <div>
              <Label>Name</Label>
              <Input
                value={newName}
                placeholder="e.g. Color"
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <Label>Display as</Label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as DisplayType)}
                className={`${inputClass} w-full`}
              >
                {(Object.keys(TYPE_LABEL) as DisplayType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Storefront filter flag. */}
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={newFilterable}
              onChange={(e) => setNewFilterable(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Use as storefront filter
              </span>
              <span className="block text-theme-xs text-gray-400">
                Shoppers can filter products by this attribute on the storefront.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAttribute}
              disabled={creating || !newName.trim()}
              className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {creating
                ? "Saving…"
                : editingId
                ? "Save changes"
                : "Add attribute"}
            </button>
          </div>
        </Modal>

        {/* Existing attributes */}
        {loading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : attributes.length === 0 ? (
          <div className={`${shell} text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No attributes yet. Use “Add attribute” to create one.
            </p>
          </div>
        ) : (
          <>
            <ListToolbar
              query={controls.query}
              onQuery={controls.setQuery}
              placeholder="Search attribute or value name"
              sortKey={controls.sortKey}
              onSortKey={controls.setSortKey}
              sortOptions={[
                { value: "name", label: "Name" },
                { value: "type", label: "Type" },
                { value: "values", label: "Value count" },
              ]}
              dir={controls.dir}
              onToggleDir={controls.toggleDir}
              summary={
                controls.total === 0
                  ? "No matches"
                  : `${controls.rangeStart}–${controls.rangeEnd} of ${controls.total}`
              }
            />

            {controls.total === 0 && (
              <div className={`${shell} text-center`}>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No attribute matches “{controls.query}”.
                </p>
              </div>
            )}

            {controls.rows.map((attr) => (
            <div key={attr.id} className={shell}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-gray-800 dark:text-white/90">
                    {attr.name}
                  </h3>
                  <Badge size="sm" color="light">
                    {TYPE_LABEL[attr.display_type]}
                  </Badge>
                  {attr.filterable && (
                    <Badge size="sm" color="info">
                      Filter
                    </Badge>
                  )}
                  <span className="text-theme-xs text-gray-400">
                    {attr.terms.length} value
                    {attr.terms.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(attr)}
                    className="text-sm text-gray-500 hover:text-brand-500"
                  >
                    Edit
                  </button>
                  <span className="text-gray-300 dark:text-gray-700">|</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttribute(attr)}
                    className="text-sm text-gray-400 hover:text-error-500"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Values */}
              <div className="flex flex-wrap gap-2 mb-4">
                {attr.terms.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center h-8 gap-2 px-3 text-sm text-gray-700 border border-gray-300 rounded-full dark:border-gray-700 dark:text-gray-300"
                  >
                    {attr.display_type === "color" && t.swatch && (
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: t.swatch }}
                      />
                    )}
                    {attr.display_type === "image" && t.swatch && (
                      <img
                        src={t.swatch}
                        alt=""
                        className="object-cover w-4 h-4 rounded"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditTerm({
                          id: t.id,
                          name: t.name,
                          swatch: t.swatch ?? "",
                          type: attr.display_type,
                        })
                      }
                      title="Edit this value"
                      className="hover:text-brand-500"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTerm(t.id, t.name)}
                      aria-label={`Delete ${t.name}`}
                      className="text-gray-400 hover:text-error-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {attr.terms.length === 0 && (
                  <span className="text-sm text-gray-400">No values yet.</span>
                )}
              </div>

              {/* Add a value */}
              {attr.display_type === "image" && (
                <div className="flex gap-2 mb-2">
                  <Input
                    value={imageDraft[attr.id] ?? ""}
                    placeholder="Image URL (https://… or /file.jpg)"
                    onChange={(e) =>
                      setImageDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setPickerAttr(attr.id)}
                    className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  >
                    Choose
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                {attr.display_type === "color" && (
                  <input
                    type="color"
                    aria-label={`${attr.name} swatch`}
                    value={swatchDraft[attr.id] ?? "#000000"}
                    onChange={(e) =>
                      setSwatchDraft((d) => ({
                        ...d,
                        [attr.id]: e.target.value,
                      }))
                    }
                    className="w-12 bg-transparent border border-gray-300 rounded-lg cursor-pointer h-11 shrink-0 dark:border-gray-700"
                  />
                )}
                <Input
                  value={termDraft[attr.id] ?? ""}
                  placeholder={`Add a ${attr.name} value…`}
                  onChange={(e) =>
                    setTermDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  onClick={() => handleAddTerm(attr)}
                  className="h-11 shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Add value
                </button>
              </div>
            </div>
            ))}

            <Pager
              page={controls.page}
              pageCount={controls.pageCount}
              onPage={controls.setPage}
            />
          </>
        )}
      </div>

      <MediaPicker
        isOpen={pickerAttr !== null}
        onClose={() => setPickerAttr(null)}
        onPick={(url) => {
          if (pickerAttr) setImageDraft((d) => ({ ...d, [pickerAttr]: url }));
        }}
      />

      {/* Media picker for the value-edit modal's image field. */}
      <MediaPicker
        isOpen={editTermPicker}
        onClose={() => setEditTermPicker(false)}
        onPick={(url) =>
          setEditTerm((t) => (t ? { ...t, swatch: url } : t))
        }
      />

      {/* Rename a value (and recolour it, for colour attributes). */}
      <Modal
        isOpen={editTerm !== null}
        onClose={() => {
          setEditTerm(null);
          setEditTermPicker(false);
        }}
        className="max-w-md w-full p-6"
      >
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit value
        </h3>
        {editTerm && (
          <div className="space-y-5">
            <div>
              <Label>Name</Label>
              <Input
                value={editTerm.name}
                onChange={(e) =>
                  setEditTerm({ ...editTerm, name: e.target.value })
                }
              />
            </div>
            {/* Colour values carry a hex; let it be recoloured. */}
            {editTerm.type === "color" && (
              <div>
                <Label>Colour</Label>
                <input
                  type="color"
                  value={
                    editTerm.swatch.startsWith("#") ? editTerm.swatch : "#000000"
                  }
                  onChange={(e) =>
                    setEditTerm({ ...editTerm, swatch: e.target.value })
                  }
                  className="w-16 bg-transparent border border-gray-300 rounded-lg cursor-pointer h-11 dark:border-gray-700"
                />
              </div>
            )}

            {/* Image values carry a URL — pick from the media library or paste. */}
            {editTerm.type === "image" && (
              <div>
                <Label>Image</Label>
                <div className="flex items-start gap-3">
                  <div className="w-16 h-16 overflow-hidden border border-gray-200 rounded-lg shrink-0 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03]">
                    {editTerm.swatch.trim() ? (
                      <img
                        src={editTerm.swatch}
                        alt=""
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-theme-xs text-gray-400">
                        None
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={editTerm.swatch}
                        placeholder="Image URL (https://… or /file.jpg)"
                        onChange={(e) =>
                          setEditTerm({ ...editTerm, swatch: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setEditTermPicker(true)}
                        className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                      >
                        Choose
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-theme-xs text-gray-400">
              The value’s slug stays the same, so existing products keep working.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => setEditTerm(null)}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveTerm}
            disabled={!editTerm?.name.trim()}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Save value
          </button>
        </div>
      </Modal>
    </div>
  );
}
