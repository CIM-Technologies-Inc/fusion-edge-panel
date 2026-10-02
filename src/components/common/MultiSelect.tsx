import { useRef, useState } from "react";

export type MultiSelectOption = { value: string; label: string };

type Props = {
  /** Shown on the trigger when nothing is selected. */
  label: string;
  options: MultiSelectOption[];
  /** Currently selected values. */
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

/**
 * A checkbox dropdown for picking several values. The trigger shows the label,
 * or the chosen count, and a chevron. Opens a panel of checkboxes with a
 * click-away backdrop. Width matches the trigger; the panel is fixed-positioned
 * so it never gets clipped by surrounding overflow.
 */
export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggleOpen = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setOpen((v) => !v);
  };

  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const triggerText =
    selected.length === 0
      ? label
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? label
      : `${label}: ${selected.length}`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`inline-flex h-11 items-center justify-between gap-2 rounded-lg border px-4 text-sm font-medium ${
          selected.length > 0
            ? "border-brand-300 text-brand-600 dark:border-brand-500/50 dark:text-brand-300"
            : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
        } bg-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03] ${className}`}
      >
        <span className="truncate">{triggerText}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              top: pos.top,
              left: Math.min(pos.left, window.innerWidth - 260),
              minWidth: Math.max(pos.width, 220),
            }}
            className="fixed z-50 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full px-3 py-2 text-left text-theme-xs font-medium text-gray-500 hover:text-error-500"
              >
                Clear selection
              </button>
            )}
            {options.length === 0 ? (
              <p className="px-3 py-2 text-theme-xs text-gray-400">No options.</p>
            ) : (
              options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggleValue(o.value)}
                    className="h-4 w-4 rounded accent-brand-500"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
