import { useState } from "react";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import MediaPicker from "../media/MediaPicker";
import { Modal } from "../ui/modal";
import {
  createAttribute,
  createTerm,
  updateTerm,
  type AttributeAssignment,
} from "../../lib/attributes";
import type { AttributeWithTerms, DisplayType } from "../../types/catalogue";

/** A value typed on the New page, not yet written to the database. */
export type PendingTerm = {
  /** Temporary id (tmp:…) used only in the UI until the product is created. */
  tempId: string;
  attribute_id: string;
  name: string;
  swatch: string | null;
};

type Props = {
  /** The global attribute pool. */
  pool: AttributeWithTerms[];
  /** Assignments currently on the product. */
  value: AttributeAssignment[];
  onChange: (next: AttributeAssignment[]) => void;
  /** Reload the pool after creating a new attribute/term. */
  onPoolChange: () => void;
  notify: (v: "success" | "error", t: string, m: string) => void;
  /**
   * Only variable products can turn an attribute into buyable variations.
   * On a simple product the "used for variations" control is hidden and
   * every attribute stays a spec — no dead pickers.
   */
  isVariable: boolean;
  /**
   * When set, values added here are private to this product (not the shared
   * pool) and are written immediately. When null/absent (the New page, where
   * the product doesn't exist yet) new values are NOT written to the global
   * pool — they're deferred: reported via `onPendingTerm` and persisted as
   * product-owned values only once the product is created.
   */
  productId?: string | null;
  /**
   * Called on the New page when a value is added, so the parent can hold it
   * locally and persist it (product-owned) at create time. Required for
   * deferred values to work when `productId` is null.
   */
  onPendingTerm?: (term: PendingTerm) => void;
  /**
   * Called on the New page when a not-yet-saved (pending) value is edited, so
   * the parent can update its local copy. Keyed by the value's temp id.
   */
  onEditPendingTerm?: (
    tempId: string,
    patch: { name: string; swatch: string | null }
  ) => void;
};

export default function AttributeBuilder({
  pool,
  value,
  onChange,
  onPoolChange,
  notify,
  isVariable,
  productId = null,
  onPendingTerm,
  onEditPendingTerm,
}: Props) {
  const [picker, setPicker] = useState("");
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState<DisplayType>("select");
  const [showNewAttr, setShowNewAttr] = useState(false);
  // Per-attribute "add a value" inputs, keyed by attribute id.
  const [termDraft, setTermDraft] = useState<Record<string, string>>({});
  // Per-attribute swatch hex, only used for color-type attributes.
  const [swatchDraft, setSwatchDraft] = useState<Record<string, string>>({});
  // Per-attribute image URL, only used for image-type attributes.
  const [imageDraft, setImageDraft] = useState<Record<string, string>>({});
  // Which attribute's image URL the media picker is filling, or null.
  const [pickerAttr, setPickerAttr] = useState<string | null>(null);

  // A product-owned value being edited (name + color/image). Only product-
  // owned or pending values are editable here; globals are read-only because
  // changing them would affect every product.
  const [editValue, setEditValue] = useState<{
    termId: string;
    name: string;
    swatch: string;
    type: DisplayType;
    /** true when this is a not-yet-saved pending value (temp id). */
    pending: boolean;
  } | null>(null);
  // True while the media picker is open FOR the value-edit modal.
  const [editValuePicker, setEditValuePicker] = useState(false);

  /** Whether a value may be edited from this product page:
   *  - persisted values only when they belong to THIS product (product_id === productId)
   *  - pending values (temp ids on the New page) are always this product's */
  const canEditTerm = (term: { id: string; product_id?: string | null }) => {
    if (term.id.startsWith("tmp:")) return true;
    return !!productId && term.product_id === productId;
  };

  const saveEditValue = async () => {
    if (!editValue || !editValue.name.trim()) return;
    const name = editValue.name.trim();
    let swatch: string | null = editValue.swatch.trim() || null;

    if (editValue.type === "color" && !swatch) swatch = "#000000";
    if (editValue.type === "image") {
      if (!swatch) {
        notify("error", "Image required", "Choose or paste an image URL.");
        return;
      }
      if (!/^https?:\/\/|^\//.test(swatch)) {
        notify("error", "Bad image URL", "URL must start with http(s):// or /.");
        return;
      }
    }

    // Pending values live only in the parent's local state until save.
    if (editValue.pending) {
      onEditPendingTerm?.(editValue.termId, { name, swatch });
      setEditValue(null);
      setEditValuePicker(false);
      return;
    }

    const { error } = await updateTerm(editValue.termId, name, swatch);
    if (error) {
      notify("error", "Could not update value", error);
      return;
    }
    notify("success", "Value updated", name);
    setEditValue(null);
    setEditValuePicker(false);
    onPoolChange();
  };

  const used = new Set(value.map((a) => a.attribute_id));
  const available = pool.filter((a) => !used.has(a.id));

  const addAssignment = (attributeId: string) => {
    if (!attributeId || used.has(attributeId)) return;
    onChange([
      ...value,
      { attribute_id: attributeId, used_for_variations: false, term_ids: [] },
    ]);
    setPicker("");
  };

  const removeAssignment = (attributeId: string) =>
    onChange(value.filter((a) => a.attribute_id !== attributeId));

  const patch = (attributeId: string, next: Partial<AttributeAssignment>) =>
    onChange(
      value.map((a) => (a.attribute_id === attributeId ? { ...a, ...next } : a))
    );

  const toggleTerm = (attributeId: string, termId: string) => {
    const a = value.find((x) => x.attribute_id === attributeId);
    if (!a) return;
    const has = a.term_ids.includes(termId);

    // A simple product's attribute is a single-value spec: picking a value
    // replaces the current one instead of adding to it. Only variable products
    // can carry several values on an attribute (for variations).
    if (!isVariable) {
      patch(attributeId, {
        term_ids: has ? [] : [termId],
        ...(has ? { default_term_id: null } : {}),
      });
      return;
    }

    patch(attributeId, {
      term_ids: has
        ? a.term_ids.filter((t) => t !== termId)
        : [...a.term_ids, termId],
      // Deselecting the term that was the default leaves it dangling.
      ...(has && a.default_term_id === termId ? { default_term_id: null } : {}),
    });
  };

  const handleCreateAttribute = async () => {
    if (!newAttrName.trim()) return;
    const { data, error } = await createAttribute(newAttrName, newAttrType);
    if (error || !data) {
      notify("error", "Could not create attribute", error ?? "Failed.");
      return;
    }
    notify("success", "Attribute created", `${data.name} added to the pool.`);
    setNewAttrName("");
    setShowNewAttr(false);
    onPoolChange();
    addAssignment(data.id);
  };

  const handleCreateTerm = async (attr: AttributeWithTerms) => {
    const name = (termDraft[attr.id] ?? "").trim();
    if (!name) return;

    // The swatch column carries a hex for color, an image URL for image,
    // and nothing for the plain (select/button) types.
    let swatch: string | null = null;
    if (attr.display_type === "color") {
      swatch = swatchDraft[attr.id] ?? "#000000";
    } else if (attr.display_type === "image") {
      const url = (imageDraft[attr.id] ?? "").trim();
      if (!url) {
        notify("error", "Image URL required", "Add an image URL for this value.");
        return;
      }
      if (!/^https?:\/\/|^\//.test(url)) {
        notify("error", "Bad image URL", "URL must start with http(s):// or /.");
        return;
      }
      swatch = url;
    }

    const clearDrafts = () => {
      setTermDraft((d) => ({ ...d, [attr.id]: "" }));
      setSwatchDraft((d) => ({ ...d, [attr.id]: "#000000" }));
      setImageDraft((d) => ({ ...d, [attr.id]: "" }));
    };

    // New page (no product yet): defer. Don't touch the global pool — keep the
    // value local until the product is created, then it's saved product-owned.
    if (!productId) {
      if (!onPendingTerm) {
        notify("error", "Can't add value yet", "Save the product first.");
        return;
      }
      const tempId = `tmp:${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      onPendingTerm({ tempId, attribute_id: attr.id, name, swatch });
      clearDrafts();
      // Auto-select the value we just added.
      toggleTerm(attr.id, tempId);
      return;
    }

    // Inside an existing product, values are private to it and persisted now.
    const { data, error } = await createTerm(attr.id, name, swatch, productId);
    if (error || !data) {
      notify("error", "Could not add value", error ?? "Failed.");
      return;
    }
    clearDrafts();
    onPoolChange();
    // Auto-select the value we just created.
    toggleTerm(attr.id, data.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Attributes</Label>
        <button
          type="button"
          onClick={() => setShowNewAttr((s) => !s)}
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          {showNewAttr ? "Cancel" : "+ New attribute"}
        </button>
      </div>
      {!isVariable && (
        <p className="text-theme-xs text-gray-400">
          Attributes on a simple product are shown as specs (e.g. Material,
          Warranty) and take a single value each. Switch to a variable product
          to allow several values and turn them into buyable options.
        </p>
      )}

      {showNewAttr && (
        <div className="flex flex-wrap items-end gap-2 p-3 border border-gray-200 rounded-lg dark:border-gray-700">
          <div className="flex-1 min-w-40">
            <Label>Name</Label>
            <Input
              value={newAttrName}
              placeholder="e.g. Color"
              onChange={(e) => setNewAttrName(e.target.value)}
            />
          </div>
          <div>
            <Label>Display</Label>
            <select
              value={newAttrType}
              onChange={(e) => setNewAttrType(e.target.value as DisplayType)}
              className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="select">Dropdown</option>
              <option value="button">Button</option>
              <option value="color">Color swatch</option>
              <option value="image">Image</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateAttribute}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Create
          </button>
        </div>
      )}

      {/* Assigned attributes */}
      {value.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No attributes yet. Add one below to describe this product.
        </p>
      )}

      {value.map((assignment) => {
        const attr = pool.find((a) => a.id === assignment.attribute_id);
        if (!attr) return null;
        return (
          <div
            key={attr.id}
            className="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-800 dark:text-white/90">
                {attr.name}
                <span className="ml-2 text-theme-xs text-gray-400">
                  {attr.display_type}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAssignment(attr.id)}
                className="text-sm text-gray-400 hover:text-error-500"
              >
                Remove
              </button>
            </div>

            {/* Value (term) chips. Product-owned/pending values get an edit
                button; global values are read-only here (manage them on the
                Attributes page — editing there would affect every product). */}
            <div className="flex flex-wrap gap-2 mb-3">
              {attr.terms.map((t) => {
                const on = assignment.term_ids.includes(t.id);
                const editable = canEditTerm(t);
                return (
                  <span
                    key={t.id}
                    className={`inline-flex h-8 items-center rounded-full border text-sm transition ${
                      on
                        ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                        : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTerm(attr.id, t.id)}
                      className={`flex h-full items-center pl-3 ${
                        editable ? "pr-1.5" : "pr-3"
                      }`}
                    >
                      {attr.display_type === "color" && t.swatch && (
                        <span
                          className="inline-block w-3 h-3 mr-1.5 rounded-full align-middle"
                          style={{ backgroundColor: t.swatch }}
                        />
                      )}
                      {attr.display_type === "image" && t.swatch && (
                        <img
                          src={t.swatch}
                          alt=""
                          className="inline-block object-cover w-4 h-4 mr-1.5 rounded align-middle"
                        />
                      )}
                      {t.name}
                    </button>
                    {editable && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditValue({
                            termId: t.id,
                            name: t.name,
                            swatch: t.swatch ?? "",
                            type: attr.display_type,
                            pending: t.id.startsWith("tmp:"),
                          })
                        }
                        aria-label={`Edit ${t.name}`}
                        title="Edit this value"
                        className="flex items-center justify-center h-full pr-2.5 pl-0.5 opacity-60 hover:opacity-100"
                      >
                        {/* pencil */}
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                  </span>
                );
              })}
              {attr.terms.length === 0 && (
                <span className="text-sm text-gray-400">No values yet.</span>
              )}
            </div>

            {/* Add a new value to this global attribute */}
            {attr.display_type === "image" && (
              <div className="flex gap-2">
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
            <div className="flex gap-2 mt-2 mb-3">
              {attr.display_type === "color" && (
                <input
                  type="color"
                  aria-label={`${attr.name} swatch color`}
                  value={swatchDraft[attr.id] ?? "#000000"}
                  onChange={(e) =>
                    setSwatchDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                  }
                  className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent dark:border-gray-700"
                />
              )}
              <Input
                value={termDraft[attr.id] ?? ""}
                placeholder={
                  attr.display_type === "color"
                    ? `${attr.name} name (+ pick a color)…`
                    : attr.display_type === "image"
                    ? `${attr.name} name (+ URL above)…`
                    : `Add a ${attr.name} value…`
                }
                onChange={(e) =>
                  setTermDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                }
              />
              <button
                type="button"
                onClick={() => handleCreateTerm(attr)}
                className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Add value
              </button>
            </div>
            <p className="mb-3 text-theme-xs text-gray-400">
              Values added here belong to this product only. Manage shared
              values on the Attributes page.
            </p>

            {isVariable && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignment.used_for_variations}
                  onChange={(e) =>
                    patch(attr.id, {
                      used_for_variations: e.target.checked,
                      // A spec has no picker, so it can't carry a default.
                      ...(e.target.checked ? {} : { default_term_id: null }),
                    })
                  }
                  className="w-4 h-4 rounded accent-brand-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Used for variations
                </span>
                <span className="text-theme-xs text-gray-400">
                  (off = shown as a spec only)
                </span>
              </label>
            )}

            {/* Which value the product page opens with. */}
            {isVariable && assignment.used_for_variations && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Default:
                </span>
                <select
                  value={assignment.default_term_id ?? ""}
                  onChange={(e) =>
                    patch(attr.id, { default_term_id: e.target.value || null })
                  }
                  className="h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">No default</option>
                  {/* Only terms this product offers can be the default. */}
                  {attr.terms
                    .filter((t) => assignment.term_ids.includes(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <span className="text-theme-xs text-gray-400">
                  preselected on the product page
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Add an existing global attribute */}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Add existing attribute…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addAssignment(picker)}
            disabled={!picker}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Add
          </button>
        </div>
      )}

      <MediaPicker
        isOpen={pickerAttr !== null}
        onClose={() => setPickerAttr(null)}
        onPick={(url) => {
          if (pickerAttr) setImageDraft((d) => ({ ...d, [pickerAttr]: url }));
        }}
      />

      {/* Edit a product-owned (or pending) value — name + color/image. */}
      <Modal
        isOpen={editValue !== null}
        onClose={() => {
          setEditValue(null);
          setEditValuePicker(false);
        }}
        className="max-w-md w-full p-6"
      >
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit value
        </h3>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          This value belongs to this product only. Shared values are edited on
          the Attributes page.
        </p>
        {editValue && (
          <div className="space-y-5">
            <div>
              <Label>Name</Label>
              <Input
                value={editValue.name}
                onChange={(e) =>
                  setEditValue({ ...editValue, name: e.target.value })
                }
              />
            </div>

            {editValue.type === "color" && (
              <div>
                <Label>Colour</Label>
                <input
                  type="color"
                  value={
                    editValue.swatch.startsWith("#")
                      ? editValue.swatch
                      : "#000000"
                  }
                  onChange={(e) =>
                    setEditValue({ ...editValue, swatch: e.target.value })
                  }
                  className="w-16 bg-transparent border border-gray-300 rounded-lg cursor-pointer h-11 dark:border-gray-700"
                />
              </div>
            )}

            {editValue.type === "image" && (
              <div>
                <Label>Image</Label>
                <div className="flex items-start gap-3">
                  <div className="w-16 h-16 overflow-hidden border border-gray-200 rounded-lg shrink-0 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03]">
                    {editValue.swatch.trim() ? (
                      <img
                        src={editValue.swatch}
                        alt=""
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-theme-xs text-gray-400">
                        None
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2">
                      <Input
                        value={editValue.swatch}
                        placeholder="Image URL (https://… or /file.jpg)"
                        onChange={(e) =>
                          setEditValue({ ...editValue, swatch: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setEditValuePicker(true)}
                        className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                      >
                        Choose
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => {
              setEditValue(null);
              setEditValuePicker(false);
            }}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveEditValue}
            disabled={!editValue?.name.trim()}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Save value
          </button>
        </div>
      </Modal>

      {/* Media picker for the value-edit modal's image field. */}
      <MediaPicker
        isOpen={editValuePicker}
        onClose={() => setEditValuePicker(false)}
        onPick={(url) =>
          setEditValue((v) => (v ? { ...v, swatch: url } : v))
        }
      />
    </div>
  );
}
