import { useState } from "react";
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
};

const btn =
  "h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]";

export default function VariationBuilder({
  attributes,
  value,
  onChange,
  notify,
}: Props) {
  const [pickerRow, setPickerRow] = useState<number | null>(null);

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

  /** A single blank variation, defaulting to each attribute's first term. */
  const addOne = () => {
    const terms: Record<string, string> = {};
    for (const a of attributes) {
      if (a.terms[0]) terms[a.attribute.id] = a.terms[0].id;
    }
    onChange([
      ...value,
      {
        id: null,
        terms,
        price: "",
        sale_price: "",
        sku: "",
        in_stock: true,
        image_url: "",
        position: value.length,
        meta: [],
      },
    ]);
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

  const possible = allCombinations(attributes).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <Label>Variations</Label>
        <div className="flex gap-2">
          <button type="button" onClick={generateAll} className={btn}>
            Generate all combinations
          </button>
          <button type="button" onClick={addOne} className={btn}>
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
          {value.map((d, i) => (
            <div
              key={i}
              className="p-4 border border-gray-200 rounded-lg dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {label(d.terms) || "New variation"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-sm text-gray-400 hover:text-error-500"
                >
                  Remove
                </button>
              </div>

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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.in_stock}
                    onChange={(e) => patch(i, { in_stock: e.target.checked })}
                    className="w-4 h-4 rounded accent-brand-500"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    In stock
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

              {/* Extra attributes — free-typed name + values, this variation only. */}
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
                    + Add attribute
                  </button>
                </div>

                {(d.meta ?? []).length === 0 ? (
                  <p className="text-theme-xs text-gray-400">
                    Optional. Add attributes like Material or Application, each
                    with one or more values.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {d.meta.map((m, mi) => {
                      const key = `${i}:${mi}`;
                      return (
                        <div
                          key={mi}
                          className="p-3 border border-gray-200 rounded-lg dark:border-gray-700"
                        >
                          <div className="flex gap-2">
                            <Input
                              value={m.name}
                              placeholder="Attribute name (e.g. Material)"
                              onChange={(e) =>
                                renameMetaAttr(i, mi, e.target.value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => removeMetaAttr(i, mi)}
                              aria-label="Remove attribute"
                              className="h-10 shrink-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-500 hover:border-error-500 hover:text-error-500 dark:border-gray-700 dark:text-gray-400"
                            >
                              ×
                            </button>
                          </div>

                          {/* Value chips */}
                          {m.values.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {m.values.map((v) => (
                                <span
                                  key={v}
                                  className="inline-flex items-center h-7 gap-1.5 rounded-full border border-gray-300 pl-3 pr-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
                                >
                                  {v}
                                  <button
                                    type="button"
                                    onClick={() => removeMetaValue(i, mi, v)}
                                    aria-label={`Remove ${v}`}
                                    className="flex items-center justify-center w-4 h-4 text-gray-400 rounded-full hover:text-error-500"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Add a value */}
                          <div className="flex gap-2 mt-2">
                            <Input
                              value={valueDraft[key] ?? ""}
                              placeholder="Add a value (e.g. Oak), press Add"
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
                            />
                            <button
                              type="button"
                              onClick={() => addMetaValue(i, mi)}
                              className={btn}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
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
