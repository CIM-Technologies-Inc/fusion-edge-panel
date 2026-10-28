import { useEffect, useState } from "react";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import MediaPicker from "../media/MediaPicker";
import {
  allCombinations,
  comboKey,
  type VariationDraft,
  type VariationMetaDraft,
} from "../../lib/variationsAdmin";
import type { ProductAttribute } from "../../types/catalogue";

type Props = {
  /** The product's attributes marked "used for variations". */
  attributes: ProductAttribute[];
  value: VariationDraft[];
  onChange: (next: VariationDraft[]) => void;
  notify: (v: "success" | "error" | "info", t: string, m: string) => void;
  /**
   * The category's "Required for this category" fields, offered on EVERY
   * variation as optional per-variation overrides. Left blank, the storefront
   * falls back to the product-level (initial) field. Carries the field's type
   * so e.g. a color field renders a color picker here too.
   */
  categoryFields?: {
    name: string;
    label: string;
    type?: string;
    options?: string[];
    default?: string;
    /** Locked (not per-variation editable) — e.g. kind / component tag. */
    disabled?: boolean;
    /** The value a locked field shows (product value or config default). */
    lockedValue?: string;
  }[];
};

const btn =
  "h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]";

export default function VariationBuilder({
  attributes,
  value,
  onChange,
  notify,
  categoryFields = [],
}: Props) {
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  // Which variation rows are expanded (by index). Collapsed by default so a
  // long list stays scannable — a row shows just its label (e.g. "Blue / 1L").
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  // Which variations have their "Category fields" sub-section open. Collapsed
  // by default — most variations leave these blank (they inherit the product).
  const [catOpen, setCatOpen] = useState<Set<number>>(new Set());
  const toggleCatOpen = (i: number) =>
    setCatOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const termName = (attributeId: string, termId: string) => {
    const attr = attributes.find((a) => a.attribute.id === attributeId);
    return attr?.terms.find((t) => t.id === termId)?.name ?? "—";
  };

  const label = (terms: Record<string, string>) =>
    attributes
      .map((a) => termName(a.attribute.id, terms[a.attribute.id]))
      .filter((n) => n !== "—")
      .join(" / ");

  const patch = (i: number, next: Partial<VariationDraft>) =>
    onChange(value.map((d, idx) => (idx === i ? { ...d, ...next } : d)));

  const remove = (i: number) =>
    onChange(value.filter((_, idx) => idx !== i));

  // --- Extra (free-typed) attributes per variation -------------------------
  // Draft text for the "add a value" box, keyed `${variationIndex}:${metaIndex}`.
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});

  const setMeta = (i: number, meta: VariationMetaDraft[]) => patch(i, { meta });

  const addMetaAttr = (i: number) =>
    setMeta(i, [...(value[i].meta ?? []), { name: "", values: [] }]);

  const removeMetaAttr = (i: number, mi: number) =>
    setMeta(i, value[i].meta.filter((_, idx) => idx !== mi));

  const renameMetaAttr = (i: number, mi: number, name: string) =>
    setMeta(i, value[i].meta.map((m, idx) => (idx === mi ? { ...m, name } : m)));

  const addMetaValue = (i: number, mi: number) => {
    const key = `${i}:${mi}`;
    const v = (valueDraft[key] ?? "").trim();
    if (!v) return;
    const m = value[i].meta[mi];
    if (m.values.includes(v)) {
      setValueDraft((d) => ({ ...d, [key]: "" }));
      return;
    }
    setMeta(
      i,
      value[i].meta.map((x, idx) =>
        idx === mi ? { ...x, values: [...x.values, v] } : x
      )
    );
    setValueDraft((d) => ({ ...d, [key]: "" }));
  };

  const removeMetaValue = (i: number, mi: number, v: string) =>
    setMeta(
      i,
      value[i].meta.map((x, idx) =>
        idx === mi ? { ...x, values: x.values.filter((y) => y !== v) } : x
      )
    );

  // --- Category fields as optional per-variation overrides -----------------
  // Each category field is stored as a single-value meta entry keyed by its
  // name. Reading returns the first value; setting replaces it (or removes the
  // meta entry when cleared, so a blank override is never saved).
  const categoryFieldValue = (i: number, name: string) =>
    value[i].meta?.find((m) => m.name === name)?.values[0] ?? "";

  const setCategoryFieldValue = (i: number, name: string, next: string) => {
    const meta = value[i].meta ?? [];
    const trimmed = next;
    const idx = meta.findIndex((m) => m.name === name);
    if (!trimmed.trim()) {
      // Cleared → drop the override entirely.
      if (idx === -1) return;
      setMeta(i, meta.filter((_, j) => j !== idx));
      return;
    }
    if (idx === -1) {
      setMeta(i, [...meta, { name, values: [trimmed] }]);
    } else {
      setMeta(
        i,
        meta.map((m, j) => (j === idx ? { ...m, values: [trimmed] } : m))
      );
    }
  };

  // The free-typed "Extra attributes" exclude any that mirror a category field
  // (those are shown in the category-fields block above), so they don't double.
  const categoryFieldNames = new Set(categoryFields.map((f) => f.name));

  // --- Color category fields default from the color OPTION -----------------
  // A variable product's color is chosen as an Option; the category's color
  // fields (…-color-hex / -color-code and …-color-name) should mirror it. We
  // find the color option attribute, then pair the color-type category field
  // (hex) with its name sibling (same prefix, -name).
  const colorOption = attributes.find(
    (a) => a.attribute.display_type === "color"
  );
  const hexField = categoryFields.find((f) => f.type === "color");
  const nameField = hexField
    ? categoryFields.find(
        (f) =>
          f.name === hexField.name.replace(/-(hex|code)$/, "-name") ||
          f.name === hexField.name.replace(/-color-(hex|code)$/, "-color-name")
      )
    : undefined;

  // Seed the color category fields from the chosen color option whenever a
  // variation has no explicit value yet (first render, or after the option
  // changes). Writing only when a value is missing avoids clobbering a manual
  // override and prevents an update loop.
  useEffect(() => {
    if (!colorOption || (!hexField && !nameField)) return;
    let changed = false;
    const next = value.map((d) => {
      const def = (() => {
        const termId = d.terms[colorOption.attribute.id];
        const term = colorOption.terms.find((t) => t.id === termId);
        return term ? { hex: term.swatch ?? "", name: term.name ?? "" } : null;
      })();
      if (!def) return d;
      let meta = d.meta ?? [];
      const seed = (fieldName: string | undefined, val: string) => {
        if (!fieldName || !val) return;
        const existing = meta.find((m) => m.name === fieldName)?.values[0] ?? "";
        if (existing.trim()) return; // keep a manual value
        meta = [
          ...meta.filter((m) => m.name !== fieldName),
          { name: fieldName, values: [val] },
        ];
        changed = true;
      };
      seed(hexField?.name, def.hex);
      seed(nameField?.name, def.name);
      return meta === (d.meta ?? []) ? d : { ...d, meta };
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value.length,
    colorOption?.attribute.id,
    // re-seed if any variation's color term changed
    value.map((d) => colorOption && d.terms[colorOption.attribute.id]).join(","),
  ]);

  /** Add every combination that isn't already present. */
  const generateAll = () => {
    const combos = allCombinations(attributes);
    if (combos.length === 0) {
      notify(
        "error",
        "Nothing to generate",
        "Give each variation attribute at least one value first."
      );
      return;
    }
    const existing = new Set(value.map((d) => comboKey(d.terms)));
    const added = combos
      .filter((c) => !existing.has(comboKey(c)))
      .map((terms, n) => ({
        id: null,
        terms,
        price: "",
        sale_price: "",
        sku: "",
        quantity: "0",
        in_stock: true,
        image_url: "",
        position: value.length + n,
        meta: [],
      }));

    if (added.length === 0) {
      notify("info", "Already complete", "Every combination exists.");
      return;
    }
    onChange([...value, ...added]);
    notify(
      "success",
      "Variations generated",
      `Added ${added.length} combination${added.length > 1 ? "s" : ""}.`
    );
  };

  /**
   * Add a single variation, seeded with the first combination that isn't used
   * yet (so it's never a duplicate). Blocked once every combination exists.
   */
  const addOne = () => {
    const combos = allCombinations(attributes);
    if (combos.length === 0) {
      notify(
        "error",
        "Nothing to add",
        "Give each variation attribute at least one value first."
      );
      return;
    }
    const existing = new Set(value.map((d) => comboKey(d.terms)));
    const nextCombo = combos.find((c) => !existing.has(comboKey(c)));
    if (!nextCombo) {
      notify(
        "info",
        "All combinations added",
        "Every combination already exists. Remove one to add a different one."
      );
      return;
    }
    const newIndex = value.length;
    onChange([
      ...value,
      {
        id: null,
        terms: nextCombo,
        price: "",
        sale_price: "",
        sku: "",
        quantity: "0",
        in_stock: true,
        image_url: "",
        position: value.length,
        meta: [],
      },
    ]);
    // Open the one just added so it's ready to fill in.
    setExpanded((prev) => new Set(prev).add(newIndex));
  };

  if (attributes.length === 0) {
    return (
      <div>
        <Label>Variations</Label>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tick “Used for variations” on at least one attribute above, then
          generate the combinations here.
        </p>
      </div>
    );
  }

  // Ticked, but no values chosen yet — nothing can be combined.
  const emptyAttributes = attributes.filter((a) => a.terms.length === 0);
  if (emptyAttributes.length === attributes.length) {
    return (
      <div>
        <Label>Variations</Label>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {emptyAttributes.map((a) => a.attribute.name).join(" and ")}{" "}
          {emptyAttributes.length === 1 ? "has" : "have"} no values selected
          yet. Choose which values this product offers in the Attributes card
          above, then the combinations can be generated.
        </p>
      </div>
    );
  }

  const combos = allCombinations(attributes);
  const possible = combos.length;
  // Every possible combination is already present → nothing new to add/generate.
  const existingKeys = new Set(value.map((d) => comboKey(d.terms)));
  const allUsed =
    possible > 0 && combos.every((c) => existingKeys.has(comboKey(c)));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <Label>Variations</Label>
        <div className="flex flex-wrap gap-2">
          {value.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) =>
                  prev.size === value.length
                    ? new Set()
                    : new Set(value.map((_, i) => i))
                )
              }
              className={btn}
            >
              {expanded.size === value.length ? "Collapse all" : "Expand all"}
            </button>
          )}
          <button
            type="button"
            onClick={generateAll}
            disabled={allUsed}
            title={allUsed ? "All combinations already added" : undefined}
            className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Generate all combinations
          </button>
          <button
            type="button"
            onClick={addOne}
            disabled={allUsed}
            title={allUsed ? "All combinations already added" : undefined}
            className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            + Add variation
          </button>
        </div>
      </div>
      <p className="mb-2 text-theme-xs text-gray-400">
        {value.length} of {possible} possible combination
        {possible === 1 ? "" : "s"}. You don’t have to sell them all.
      </p>
      {emptyAttributes.length > 0 && (
        <p className="mb-4 text-theme-xs text-warning-600 dark:text-warning-400">
          {emptyAttributes.map((a) => a.attribute.name).join(", ")} has no
          values selected, so it isn’t part of these combinations.
        </p>
      )}

      {value.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No variations yet. Generate them from your attributes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((d, i) => {
            const isOpen = expanded.has(i);
            return (
            <div
              key={i}
              className="border border-gray-200 rounded-lg dark:border-gray-800"
            >
              {/* Header — click to expand/collapse. Collapsed shows just the
                  label plus a price/qty summary. */}
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleExpanded(i)}
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center gap-2 min-w-0 text-left"
                >
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span className="truncate font-medium text-gray-800 dark:text-white/90">
                    {label(d.terms) || "New variation"}
                  </span>
                  {!isOpen && (
                    <span className="truncate text-theme-xs text-gray-400">
                      {d.sku ? `· ${d.sku} ` : ""}
                      {d.price ? `· ₱${d.price}` : "· no price"} · qty{" "}
                      {d.quantity || "0"}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="shrink-0 text-sm text-gray-400 hover:text-error-500"
                >
                  Remove
                </button>
              </div>

              {isOpen && (
              <div className="px-4 pb-4">
              {/* Which term of each attribute this variation is. */}
              <div className="grid gap-3 mb-3 sm:grid-cols-2">
                {attributes.map((a) => (
                  <div key={a.attribute.id}>
                    <span className="block mb-1 text-theme-xs text-gray-500 dark:text-gray-400">
                      {a.attribute.name}
                    </span>
                    <select
                      value={d.terms[a.attribute.id] ?? ""}
                      onChange={(e) =>
                        patch(i, {
                          terms: { ...d.terms, [a.attribute.id]: e.target.value },
                        })
                      }
                      className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    >
                      <option value="">Choose…</option>
                      {a.terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <span className="block mb-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    Price (PHP) *
                  </span>
                  <Input
                    type="number"
                    step={0.01}
                    value={d.price}
                    onChange={(e) => patch(i, { price: e.target.value })}
                  />
                </div>
                <div>
                  <span className="block mb-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    Sale price
                  </span>
                  <Input
                    type="number"
                    step={0.01}
                    value={d.sale_price}
                    onChange={(e) => patch(i, { sale_price: e.target.value })}
                  />
                </div>
                <div>
                  <span className="block mb-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    SKU <span className="text-error-500">*</span>
                  </span>
                  <Input
                    value={d.sku}
                    error={!d.sku.trim()}
                    onChange={(e) => patch(i, { sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3">
                <label className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Qty
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={1}
                    value={d.quantity}
                    onChange={(e) => patch(i, { quantity: e.target.value })}
                    className="h-9 w-24 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:text-white/90"
                  />
                  <span className="text-theme-xs text-gray-400">
                    {Number(d.quantity) > 0 ? "in stock" : "out of stock"}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  {d.image_url ? (
                    <img
                      src={d.image_url}
                      alt=""
                      className="object-cover w-10 h-10 rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerRow(i)}
                    className={btn}
                  >
                    {d.image_url ? "Change image" : "Add image"}
                  </button>
                  {d.image_url && (
                    <button
                      type="button"
                      onClick={() => patch(i, { image_url: "" })}
                      className="text-sm text-gray-400 hover:text-error-500"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Category fields — optional per-variation overrides. Left blank,
                  the storefront uses the product-level (initial) field. */}
              {categoryFields.length > 0 && (
                <div className="pt-3 mt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleCatOpen(i)}
                    aria-expanded={catOpen.has(i)}
                    className="mb-2 flex w-full items-center gap-1.5 text-left text-theme-xs font-medium text-gray-600 dark:text-gray-300"
                  >
                    <svg
                      className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
                        catOpen.has(i) ? "rotate-90" : ""
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    Category fields{" "}
                    <span className="font-normal text-gray-400">
                      (optional — overrides the product field)
                    </span>
                  </button>
                  {catOpen.has(i) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {categoryFields.map((f) => {
                      const v = categoryFieldValue(i, f.name);
                      const set = (next: string) =>
                        setCategoryFieldValue(i, f.name, next);
                      return (
                        <div key={f.name}>
                          <span className="block mb-1 text-theme-xs text-gray-500 dark:text-gray-400">
                            {f.label}
                          </span>
                          {f.disabled ? (
                            // Locked (kind / component tag): same for every
                            // variation — show the value, read-only.
                            <Input
                              value={f.lockedValue ?? f.default ?? ""}
                              disabled
                              onChange={() => {}}
                            />
                          ) : f.type === "color" ? (
                            <div className="flex gap-2">
                              <input
                                type="color"
                                aria-label={`${f.label} color`}
                                value={
                                  /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000"
                                }
                                onChange={(e) => set(e.target.value)}
                                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent dark:border-gray-700"
                              />
                              <Input
                                value={v}
                                placeholder="#000000"
                                onChange={(e) => set(e.target.value)}
                              />
                            </div>
                          ) : f.type === "boolean" ? (
                            <div className="flex gap-2">
                              {["yes", "no"].map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => set(v === opt ? "" : opt)}
                                  className={`h-10 flex-1 rounded-lg border text-sm font-medium capitalize ${
                                    v === opt
                                      ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                                      : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          ) : f.type === "select" ? (
                            <select
                              value={v}
                              onChange={(e) => set(e.target.value)}
                              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                            >
                              <option value="">Use the product field</option>
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type={f.type === "number" ? "number" : "text"}
                              value={v}
                              placeholder="Leave blank to use the product field"
                              onChange={(e) => set(e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}

              {/* Extra attributes — Name / Values rows, styled like the
                  product's Specifications editor. Free-typed, this variation
                  only. */}
              <div className="pt-3 mt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-theme-xs font-medium text-gray-600 dark:text-gray-300">
                    Extra attributes
                  </span>
                  <button
                    type="button"
                    onClick={() => addMetaAttr(i)}
                    className="text-sm font-medium text-brand-500 hover:text-brand-600"
                  >
                    + Add row
                  </button>
                </div>

                {(d.meta ?? []).filter((m) => !categoryFieldNames.has(m.name))
                  .length === 0 ? (
                  <p className="text-theme-xs text-gray-400">
                    Optional. Add attributes like Material or Application, each
                    with one or more values.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {d.meta.map((m, mi) => {
                      // Category fields are shown in their own block above.
                      if (categoryFieldNames.has(m.name)) return null;
                      const key = `${i}:${mi}`;
                      return (
                        <div
                          key={mi}
                          className="flex flex-col gap-2 sm:flex-row sm:items-start"
                        >
                          {/* Name */}
                          <div className="w-full sm:w-2/5 sm:shrink-0">
                            <Input
                              value={m.name}
                              placeholder="Name (e.g. Material)"
                              onChange={(e) =>
                                renameMetaAttr(i, mi, e.target.value)
                              }
                            />
                          </div>

                          {/* Values — chip box (chips + inline add), like Specs. */}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-transparent px-2 py-1.5 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700">
                              {m.values.map((v) => (
                                <span
                                  key={v}
                                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 pl-2.5 pr-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                                >
                                  <span className="max-w-[160px] truncate">
                                    {v}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeMetaValue(i, mi, v)}
                                    aria-label={`Remove ${v}`}
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
                                value={valueDraft[key] ?? ""}
                                placeholder={
                                  m.values.length ? "+ Add value" : "+ Add value…"
                                }
                                onChange={(e) =>
                                  setValueDraft((dd) => ({
                                    ...dd,
                                    [key]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addMetaValue(i, mi);
                                  }
                                }}
                                onBlur={() => addMetaValue(i, mi)}
                                className="h-7 min-w-28 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
                              />
                            </div>
                          </div>

                          {/* Remove row */}
                          <button
                            type="button"
                            onClick={() => removeMetaAttr(i, mi)}
                            aria-label="Remove row"
                            title="Remove this attribute"
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
                  </div>
                )}
              </div>
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <MediaPicker
        isOpen={pickerRow !== null}
        onClose={() => setPickerRow(null)}
        onPick={(url) => {
          if (pickerRow !== null) patch(pickerRow, { image_url: url });
        }}
      />
    </div>
  );
}
