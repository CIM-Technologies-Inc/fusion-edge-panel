import { useState } from "react";

const iconBtn =
  "flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/[0.06]";

/**
 * An ellipsis (⋯) button that opens a small menu. The menu is fixed-positioned
 * to the button so surrounding overflow/scroll never clips it.
 */
export default function RowMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // Anchor the menu's top-right under the button's bottom-right.
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="More"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${iconBtn} hover:text-brand-500`}
      >
        {/* vertical ellipsis */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && pos && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </>
  );
}

/** A single row inside a RowMenu. */
export function MenuItem({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-theme-sm disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? "text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10"
          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

/** The pencil edit icon button (shared across list pages). */
export function EditIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Edit"
      aria-label="Edit"
      className={`${iconBtn} hover:text-brand-500`}
    >
      {/* pencil */}
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
