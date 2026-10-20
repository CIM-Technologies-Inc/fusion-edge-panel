import { useRef, useState } from "react";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import MediaPicker from "../media/MediaPicker";
import { Modal } from "../ui/modal";
import {
  createAttribute,
  createTerm,
  updateTerm,
  updateAttribute,
  type AttributeAssignment,
} from "../../lib/attributes";
import type {
  AttributeTerm,
  AttributeWithTerms,
  DisplayType,
} from "../../types/catalogue";

/**
 * Short label for a value chip. URL/path values (e.g. an RFA file link) show
 * just the filename; everything else shows as-is. The full value stays on the
 * chip's title (hover) and is what's saved.
 */
function valueLabel(value: string): string {
  const v = value.trim();
  if (/^https?:\/\/|^\//.test(v)) {
    const last = v.split(/[?#]/)[0].split("/").pop();
    if (last) return decodeURIComponent(last);
  }
  return value;
}

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
  // "Use an attribute…" picker for the Options section.
  const [optionPicker, setOptionPicker] = useState("");
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState<DisplayType>("select");
  // The new-attribute form is open for a section: null = closed, "spec" or
  // "option" = which section it will add the new attribute to.
  const [showNewAttr, setShowNewAttr] = useState<null | "spec" | "option">(
    null
  );
  // Per-attribute "add a value" inputs, keyed by attribute id.
  const [termDraft, setTermDraft] = useState<Record<string, string>>({});
  // Per-attribute swatch hex, only used for color-type attributes.
  const [swatchDraft, setSwatchDraft] = useState<Record<string, string>>({});
  // Per-attribute image URL, only used for image-type attributes.
  const [imageDraft, setImageDraft] = useState<Record<string, string>>({});
  // Which attribute's image URL the media picker is filling, or null.
  const [pickerAttr, setPickerAttr] = useState<string | null>(null);

  // Specifications are edited as Name/Value rows. Committed rows live in
  // `specAssignments` (a real attribute + its selected values); `specRows` are
  // blank rows the "+ Add row" button appends, kept local until a Name is
  // chosen (then they become a real assignment).
  const [specRows, setSpecRows] = useState<{ localId: string; name: string }[]>(
    []
  );

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
  // Hide "data-…" attributes (CIM config/required fields managed per category)
  // from the manual "Add existing attribute" list.
  const isConfigAttr = (a: AttributeWithTerms) =>
    /^data-/i.test(a.slug ?? "") || /^data-/i.test(a.name ?? "");
  const available = pool.filter((a) => !used.has(a.id) && !isConfigAttr(a));

  const addAssignment = (attributeId: string, forVariations = false) => {
    if (!attributeId || used.has(attributeId)) return;
    onChange([
      ...value,
      {
        attribute_id: attributeId,
        used_for_variations: forVariations,
        term_ids: [],
      },
    ]);
    setOptionPicker("");
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

    // Both options and specs can carry several values — toggle in/out of the set.
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
    const forVariations = showNewAttr === "option";
    // Specs don't need a Display type; options use the chosen one.
    const type: DisplayType = forVariations ? newAttrType : "select";
    const { data, error } = await createAttribute(newAttrName, type);
    if (error || !data) {
      notify("error", "Could not create attribute", error ?? "Failed.");
      return;
    }
    notify("success", "Attribute created", `${data.name} added to the pool.`);
    setNewAttrName("");
    setShowNewAttr(null);
    onPoolChange();
    addAssignment(data.id, forVariations);
  };

  const handleCreateTerm = async (attr: AttributeWithTerms) => {
    const name = (termDraft[attr.id] ?? "").trim();
    if (!name) return;

    // The swatch column carries a hex for color, an image URL for image, and
    // nothing for the plain types. On a simple product every value is plain
    // spec text, so no swatch/image is collected regardless of display type.
    let swatch: string | null = null;
    if (isVariable && attr.display_type === "color") {
      swatch = swatchDraft[attr.id] ?? "#000000";
    } else if (isVariable && attr.display_type === "image") {
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

  // --- Specifications rows (simple Name/Value editor) ------------------------
  // A spec is an attribute (found/created by name so names stay consistent
  // across the shop) holding one or more PRODUCT-OWNED values. The Name is a
  // searchable list of existing attributes (type a new one to create it); the
  // Value is a multi-select of that attribute's values plus an inline add.

  /** Find a pool attribute by name (case-insensitive) or create it as a spec. */
  const findOrCreateSpecAttr = async (
    name: string
  ): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = pool.find(
      (a) => a.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing.id;
    const { data, error } = await createAttribute(trimmed, "select");
    if (error || !data) {
      notify("error", "Could not add specification", error ?? "Failed.");
      return null;
    }
    onPoolChange();
    return data.id;
  };

  /**
   * Create a new SHARED (global) value on a spec attribute and select it. Spec
   * values are shared so they can be reused across products and show up in the
   * Values dropdown everywhere. Global terms don't depend on the product
   * existing, so this works the same on the New and Edit pages (no deferral).
   * If the value already exists on the attribute, just select it instead of
   * creating a duplicate. Returns the term id, or null on failure.
   */
  const addSpecValue = async (
    attributeId: string,
    value: string
  ): Promise<string | null> => {
    const v = value.trim();
    if (!v) return null;

    // Reuse an existing value (case-insensitive) rather than duplicating it.
    const attr = pool.find((a) => a.id === attributeId);
    const existing = attr?.terms.find(
      (t) => t.name.trim().toLowerCase() === v.toLowerCase()
    );
    if (existing) {
      if (!value_isSelected(attributeId, existing.id))
        toggleTerm(attributeId, existing.id);
      return existing.id;
    }

    const { data, error } = await createTerm(attributeId, v, null, null);
    if (error || !data) {
      notify("error", "Could not add value", error ?? "Failed.");
      return null;
    }
    onPoolChange();
    toggleTerm(attributeId, data.id);
    return data.id;
  };

  /** Whether an attribute's term is already selected on this product. */
  const value_isSelected = (attributeId: string, termId: string) =>
    value
      .find((a) => a.attribute_id === attributeId)
      ?.term_ids.includes(termId) ?? false;

  /**
   * Choose the attribute for a blank spec row (by name, creating it if needed).
   * Turns the row into a real spec assignment with no values yet, then drops
   * the blank row so the committed row takes over.
   */
  const chooseSpecAttr = async (localId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const attributeId = await findOrCreateSpecAttr(trimmed);
    if (!attributeId) return;
    if (!used.has(attributeId)) {
      onChange([
        ...value.filter((a) => a.attribute_id !== attributeId),
        { attribute_id: attributeId, used_for_variations: false, term_ids: [] },
      ]);
    }
    setSpecRows((rows) => rows.filter((r) => r.localId !== localId));
  };

  /** Rename a committed spec's attribute (affects the shared attribute). */
  const commitSpecName = async (attr: AttributeWithTerms, nextName: string) => {
    const next = nextName.trim();
    if (!next || next === attr.name) return;
    // Renaming to an EXISTING attribute means "use that one instead".
    const other = pool.find(
      (a) =>
        a.id !== attr.id &&
        a.name.trim().toLowerCase() === next.toLowerCase()
    );
    if (other) {
      if (used.has(other.id)) {
        // Already on the product — just drop this row (avoid a duplicate).
        removeAssignment(attr.id);
      } else {
        onChange(
          value.map((a) =>
            a.attribute_id === attr.id
              ? { ...a, attribute_id: other.id, term_ids: [] }
              : a
          )
        );
      }
      return;
    }
    const { error } = await updateAttribute(attr.id, next, attr.display_type);
    if (error) return notify("error", "Couldn't rename specification", error);
    onPoolChange();
  };

  // --- Options-card editing (name rename + "Show as" display type) ----------
  // Renaming or changing the display type edits the GLOBAL attribute, so it
  // affects this attribute wherever else it's used. Name is drafted locally and
  // persisted on blur so we don't write on every keystroke.
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});

  const commitRename = async (attr: AttributeWithTerms) => {
    const next = (nameDraft[attr.id] ?? attr.name).trim();
    setNameDraft((d) => {
      const { [attr.id]: _drop, ...rest } = d;
      return rest;
    });
    if (!next || next === attr.name) return;
    const { error } = await updateAttribute(attr.id, next, attr.display_type);
    if (error) return notify("error", "Couldn't rename option", error);
    onPoolChange();
  };

  const setDisplayType = async (
    attr: AttributeWithTerms,
    display: DisplayType
  ) => {
    if (display === attr.display_type) return;
    const { error } = await updateAttribute(attr.id, attr.name, display);
    if (error) return notify("error", "Couldn't change display", error);
    onPoolChange();
  };

  // The segmented "Show as" control mirrors the storefront picker styles.
  const SHOW_AS: { value: DisplayType; label: string }[] = [
    { value: "button", label: "Buttons" },
    { value: "select", label: "Dropdown" },
    { value: "color", label: "Color swatches" },
    { value: "image", label: "Image swatches" },
  ];

  /**
   * The Options card, laid out like the storefront's "Options" step: a titled
   * card with an inline Name field, a chip-style Values box (type + Enter to
   * add, × to remove), and a "Show as" segmented control.
   */
  const renderOptionCard = (assignment: AttributeAssignment, index: number) => {
    const attr = pool.find((a) => a.id === assignment.attribute_id);
    if (!attr) return null;
    const selected = attr.terms.filter((t) =>
      assignment.term_ids.includes(t.id)
    );
    const draft = termDraft[attr.id] ?? "";

    return (
      <div
        key={attr.id}
        className="rounded-xl border border-gray-200 p-5 dark:border-gray-700"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-theme-xs font-semibold uppercase tracking-wide text-gray-400">
            Option {index + 1}
          </span>
          <button
            type="button"
            onClick={() => removeAssignment(attr.id)}
            aria-label={`Remove ${attr.name}`}
            title="Remove this option"
            className="text-gray-400 hover:text-error-500"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
          {/* Name — renames the (shared) attribute on blur. */}
          <div>
            <Label>Name</Label>
            <Input
              value={nameDraft[attr.id] ?? attr.name}
              placeholder="e.g. Size"
              onChange={(e) =>
                setNameDraft((d) => ({ ...d, [attr.id]: e.target.value }))
              }
              onBlur={() => commitRename(attr)}
            />
          </div>

          {/* Values — chip input: selected values as removable chips, then an
              inline field to add more (Enter or blur). */}
          <div>
            <Label>Values ({selected.length})</Label>
            <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-transparent px-2 py-1.5 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700">
              {selected.map((t) => {
                const editable = canEditTerm(t);
                return (
                  <span
                    key={t.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 pl-2.5 pr-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                  >
                    {attr.display_type === "color" && t.swatch && (
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: t.swatch }}
                      />
                    )}
                    {attr.display_type === "image" && t.swatch && (
                      <img
                        src={t.swatch}
                        alt=""
                        className="inline-block h-4 w-4 rounded object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        editable &&
                        setEditValue({
                          termId: t.id,
                          name: t.name,
                          swatch: t.swatch ?? "",
                          type: attr.display_type,
                          pending: t.id.startsWith("tmp:"),
                        })
                      }
                      title={editable ? "Edit this value" : t.name}
                      className="max-w-[160px] truncate"
                    >
                      {valueLabel(t.name)}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTerm(attr.id, t.id)}
                      aria-label={`Remove ${t.name}`}
                      title="Remove from this option"
                      className="flex h-4 w-4 items-center justify-center rounded-full text-brand-500/70 hover:bg-brand-500/20 hover:text-brand-600"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
              <input
                value={draft}
                placeholder={selected.length ? "+ Add value" : "+ Add value…"}
                onChange={(e) =>
                  setTermDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTerm(attr);
                  }
                }}
                className="h-7 min-w-28 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
              />
            </div>

            {/* Color/image values need an extra pick before "Add value". */}
            {isVariable && attr.display_type === "color" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${attr.name} swatch color`}
                  value={swatchDraft[attr.id] ?? "#000000"}
                  onChange={(e) =>
                    setSwatchDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                  }
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent dark:border-gray-700"
                />
                <span className="text-theme-xs text-gray-400">
                  Pick a color, type the value name, then press Enter.
                </span>
              </div>
            )}
            {isVariable && attr.display_type === "image" && (
              <div className="mt-2 flex gap-2">
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
          </div>
        </div>

        {/* Show as — how buyers pick this option (edits the shared attribute). */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Label className="mb-0">Show as</Label>
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
            {SHOW_AS.map((s) => {
              const on = attr.display_type === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setDisplayType(attr, s.value)}
                  className={`h-8 rounded-md px-3 text-sm font-medium transition ${
                    on
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Which value the product page opens with. */}
        {assignment.used_for_variations && selected.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
              {selected.map((t) => (
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
  };

  // The new-attribute inline form, shared by both sections.
  const newAttrForm = (
    <div className="flex flex-wrap items-end gap-2 p-3 border border-gray-200 rounded-lg dark:border-gray-700">
      <div className="flex-1 min-w-40">
        <Label>Name</Label>
        <Input
          value={newAttrName}
          placeholder="e.g. Color"
          onChange={(e) => setNewAttrName(e.target.value)}
        />
      </div>
      {/* "Display" controls how buyers PICK an option — only for options. */}
      {showNewAttr === "option" && (
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
      )}
      <button
        type="button"
        onClick={handleCreateAttribute}
        className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
      >
        Create
      </button>
      <button
        type="button"
        onClick={() => {
          setShowNewAttr(null);
          setNewAttrName("");
        }}
        className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
      >
        Cancel
      </button>
    </div>
  );

  const optionAssignments = value.filter((a) => a.used_for_variations);
  const specAssignments = value.filter((a) => !a.used_for_variations);
  // The storefront variation picker is built for a handful of options; cap at 4.
  const optionsAtMax = optionAssignments.length >= 4;

  // Each section is its own card. Specifications is rendered first, Options
  // second (see the return below).
  const sectionCard =
    "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

  // OPTIONS — only variable products have buyable options/variations.
  const optionsSection = isVariable ? (
        <section className={`${sectionCard} space-y-4`}>
          <div>
            <Label>Options</Label>
            <p className="text-theme-xs text-gray-400">
              Add what customers choose from, such as Size or Color. Every
              combination of values becomes a variation.
            </p>
          </div>

          {optionAssignments.length > 0 && (
            <div className="space-y-4">
              {optionAssignments.map((a, i) => renderOptionCard(a, i))}
            </div>
          )}

          {showNewAttr === "option" && optionsAtMax && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You can have up to 4 options. Remove one to add another.
            </p>
          )}
          {showNewAttr === "option" && !optionsAtMax && newAttrForm}

          {/* Footer: use an existing attribute, or add a custom option. */}
          {!optionsAtMax && (
            <div className="flex flex-wrap items-center gap-3">
              {available.length > 0 && (
                <select
                  value={optionPicker}
                  onChange={(e) => {
                    const id = e.target.value;
                    setOptionPicker(id);
                    if (id) addAssignment(id, true);
                  }}
                  className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">+ Use an attribute…</option>
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() =>
                  setShowNewAttr((s) => (s === "option" ? null : "option"))
                }
                className="h-11 rounded-lg border border-brand-300 px-4 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:border-brand-500/40 dark:hover:bg-brand-500/10"
              >
                + Add a custom option
              </button>
            </div>
          )}

          <p className="text-theme-xs text-gray-400">
            An option from an attribute keeps its names and colors in line with
            the shop filter. Up to 4 options.
          </p>
        </section>
  ) : null;

  // SPECIFICATIONS — Name (searchable attribute list + create) and Value
  // (multi-select of that attribute's values + add new).
  // Attribute names already used as specs on this product aren't offered again.
  const specNameSuggestions = pool
    .filter((a) => !isConfigAttr(a))
    .filter((a) => !specAssignments.some((s) => s.attribute_id === a.id))
    .map((a) => a.name);

  const specsSection = (
      <section className={`${sectionCard} space-y-4`}>
        <div className="flex items-center justify-between">
          <Label className="mb-0">Specifications</Label>
          <button
            type="button"
            onClick={() =>
              setSpecRows((rows) => [
                ...rows,
                {
                  localId: `row:${Date.now().toString(36)}${Math.random()
                    .toString(36)
                    .slice(2, 6)}`,
                  name: "",
                },
              ])
            }
            className="text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            + Add row
          </button>
        </div>

        {/* Two-column header: Name | Values. */}
        {(specAssignments.length > 0 || specRows.length > 0) && (
          <div className="hidden gap-3 sm:flex">
            <span className="w-2/5 text-theme-xs font-medium text-gray-400">
              Name
            </span>
            <span className="flex-1 text-theme-xs font-medium text-gray-400">
              Values
            </span>
            <span className="w-5 shrink-0" />
          </div>
        )}

        <div className="space-y-3">
          {/* Committed specs: searchable Name + chip Values box. */}
          {specAssignments.map((a) => {
            const attr = pool.find((p) => p.id === a.attribute_id);
            if (!attr) return null;
            return (
              <div
                key={attr.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-start"
              >
                <div className="w-full sm:w-2/5 sm:shrink-0">
                  <SpecNameCombo
                    value={attr.name}
                    options={specNameSuggestions}
                    onPick={(name) => commitSpecName(attr, name)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <SpecValuesField
                    terms={attr.terms}
                    selected={a.term_ids}
                    displayType={attr.display_type}
                    canEditTerm={canEditTerm}
                    onToggle={(termId) => toggleTerm(attr.id, termId)}
                    onAddNew={(name) => addSpecValue(attr.id, name)}
                    onEditValue={(t) =>
                      setEditValue({
                        termId: t.id,
                        name: t.name,
                        swatch: t.swatch ?? "",
                        type: attr.display_type,
                        pending: t.id.startsWith("tmp:"),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAssignment(attr.id)}
                  aria-label={`Remove ${attr.name}`}
                  title="Remove this specification"
                  className="shrink-0 self-start text-gray-400 hover:text-error-500 sm:mt-2.5"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Blank rows: choose/create the attribute by name to start a spec. */}
          {specRows.map((row) => (
            <div
              key={row.localId}
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <div className="w-full sm:w-2/5 sm:shrink-0">
                <SpecNameCombo
                  value=""
                  autoFocus
                  options={specNameSuggestions}
                  onPick={(name) => chooseSpecAttr(row.localId, name)}
                />
              </div>
              <span className="flex-1 pt-3 text-theme-xs text-gray-400">
                Choose or type a name, then pick its values.
              </span>
              <button
                type="button"
                onClick={() =>
                  setSpecRows((rows) =>
                    rows.filter((r) => r.localId !== row.localId)
                  )
                }
                aria-label="Remove row"
                title="Remove this row"
                className="shrink-0 self-start text-gray-400 hover:text-error-500 sm:mt-2.5"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {specAssignments.length === 0 && specRows.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No specifications yet. Use “+ Add row”.
            </p>
          )}
        </div>

        <p className="text-theme-xs text-gray-400">
          Shown in the Specifications table on the product page.
        </p>
      </section>
  );

  return (
    <div className="space-y-6">
      {/* Specifications first, then Options. */}
      {specsSection}
      {optionsSection}

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

/* ------------------------------------------------------------------------- */
/* Specification field widgets (searchable name combobox + chip values box). */
/* ------------------------------------------------------------------------- */

/**
 * Searchable attribute-name picker. Shows matching existing attributes in a
 * dropdown; when the typed text doesn't exactly match one, a "Create …" row
 * lets you make a new attribute. Calls onPick with the chosen/typed name.
 */
function SpecNameCombo({
  value,
  options,
  placeholder = "Name (e.g. Material)",
  autoFocus,
  onPick,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the field in sync when the committed value changes from outside.
  const q = query.trim();
  const matches = options.filter((o) =>
    o.toLowerCase().includes(q.toLowerCase())
  );
  const exact = options.some((o) => o.toLowerCase() === q.toLowerCase());

  const choose = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setQuery(n);
    setOpen(false);
    onPick(n);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            choose(query);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => {
          // Let a click on a dropdown row register before closing/committing.
          window.setTimeout(() => {
            setOpen(false);
            if (query.trim() && query.trim() !== value) choose(query);
          }, 150);
        }}
        className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      />
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              {o}
            </button>
          ))}
          {q && !exact && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(q)}
              className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-brand-500 hover:bg-brand-50 dark:border-gray-800 dark:hover:bg-brand-500/10"
            >
              Create “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Chip box for a spec's values: selected values show as removable chips; the
 * box opens a dropdown of the attribute's other existing values to add, and a
 * field to type a brand-new value. Mirrors the Options values box.
 */
function SpecValuesField({
  terms,
  selected,
  displayType,
  canEditTerm,
  onToggle,
  onAddNew,
  onEditValue,
}: {
  terms: AttributeTerm[];
  selected: string[];
  displayType: DisplayType;
  canEditTerm: (t: AttributeTerm) => boolean;
  onToggle: (termId: string) => void;
  onAddNew: (name: string) => void;
  onEditValue: (t: AttributeTerm) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = terms.filter((t) => selected.includes(t.id));
  const q = draft.trim().toLowerCase();
  const available = terms.filter(
    (t) => !selected.includes(t.id) && t.name.toLowerCase().includes(q)
  );
  const exact = terms.some((t) => t.name.toLowerCase() === q);

  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    onAddNew(n);
    setDraft("");
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="flex min-h-11 cursor-text flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-transparent px-2 py-1.5 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700"
      >
        {chosen.map((t) => (
          <span
            key={t.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 pl-2.5 pr-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
          >
            {displayType === "color" && t.swatch && (
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: t.swatch }}
              />
            )}
            {displayType === "image" && t.swatch && (
              <img
                src={t.swatch}
                alt=""
                className="inline-block h-4 w-4 rounded object-cover"
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (canEditTerm(t)) onEditValue(t);
              }}
              title={canEditTerm(t) ? "Edit this value" : t.name}
              className="max-w-[160px] truncate"
            >
              {t.name}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(t.id);
              }}
              aria-label={`Remove ${t.name}`}
              title="Remove from this specification"
              className="flex h-4 w-4 items-center justify-center rounded-full text-brand-500/70 hover:bg-brand-500/20 hover:text-brand-600"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={chosen.length ? "" : "Select or add values…"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            }
          }}
          className="h-7 min-w-28 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {available.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onToggle(t.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                {displayType === "color" && t.swatch && (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: t.swatch }}
                  />
                )}
                {displayType === "image" && t.swatch && (
                  <img
                    src={t.swatch}
                    alt=""
                    className="inline-block h-4 w-4 shrink-0 rounded object-cover"
                  />
                )}
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            {draft.trim() && !exact && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(draft)}
                className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-brand-500 hover:bg-brand-50 dark:border-gray-800 dark:hover:bg-brand-500/10"
              >
                Create “{draft.trim()}”
              </button>
            )}
            {available.length === 0 && !(draft.trim() && !exact) && (
              <p className="px-3 py-2 text-theme-xs text-gray-400">
                {terms.length === 0
                  ? "No values yet — type to add one."
                  : "All values selected."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
