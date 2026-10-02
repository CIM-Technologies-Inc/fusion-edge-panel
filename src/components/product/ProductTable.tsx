import { Link } from "react-router";
import Badge from "../ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import RowMenu, { MenuItem } from "../common/RowMenu";
import { formatCents, formatPrice } from "../../lib/price";
import type { Product } from "../../types/catalogue";

function Thumb({ product }: { product: Product }) {
  const main = product.images.find((i) => i.variation_id === null) ?? product.images[0];

  if (!main) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800">
        <span className="text-gray-400 text-theme-xs">—</span>
      </div>
    );
  }

  return (
    <img
      src={main.url}
      alt={main.alt ?? product.name}
      className="object-cover w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800"
      loading="lazy"
    />
  );
}

export type ProductSortKey = "name" | "created" | "updated";

type Props = {
  products: Product[];
  /** Whether the Edit link is shown. */
  canEdit?: boolean;
  /** Managers get row actions (edit/duplicate/delete); omit for read-only. */
  onDuplicate?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  /** Show the change history for a product. */
  onActivity?: (product: Product) => void;
  duplicatingId?: string | null;
  deletingId?: string | null;
  /** Header sorting. Clicking a sortable header calls onSort with its key. */
  sortKey?: ProductSortKey;
  sortDir?: "asc" | "desc";
  onSort?: (key: ProductSortKey) => void;
  /**
   * Clicking a row selects it (parent shows an action popover for it). Receives
   * the row's bounding rect so the parent can anchor a popover above it.
   */
  onRowClick?: (product: Product, rect: DOMRect) => void;
  /** The currently selected product id, highlighted in the table. */
  selectedId?: string | null;
  /** Bulk selection: when provided, a checkbox column is shown. */
  checkedIds?: Set<string>;
  onToggleCheck?: (id: string) => void;
  onToggleCheckAll?: () => void;
  /** True when every product on this page is checked. */
  allChecked?: boolean;
};

const editIconBtn =
  "flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-white/[0.06]";

/** Short date like "Sep 30, 2026", or — when missing. */
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

/** A caret that shows the active sort direction, dimmed when inactive. */
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-transform ${
        active ? "text-brand-500" : "text-gray-300 dark:text-gray-600"
      } ${active && dir === "asc" ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function ProductTable({
  products,
  canEdit,
  onDuplicate,
  onDelete,
  onActivity,
  duplicatingId,
  deletingId,
  sortKey,
  sortDir = "desc",
  onSort,
  onRowClick,
  selectedId,
  checkedIds,
  onToggleCheck,
  onToggleCheckAll,
  allChecked,
}: Props) {
  const showActions = !!canEdit || !!onDuplicate || !!onDelete || !!onActivity;
  const showCheck = !!checkedIds && !!onToggleCheck;

  // A sortable header cell. Falls back to a plain label when onSort is absent.
  const SortableTh = ({
    label,
    col,
  }: {
    label: string;
    col: ProductSortKey;
  }) => (
    <TableCell
      isHeader
      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
    >
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort(col)}
          className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {label}
          <SortIcon active={sortKey === col} dir={sortDir} />
        </button>
      ) : (
        label
      )}
    </TableCell>
  );

  const plainTh = (label: string) => (
    <TableCell
      key={label}
      isHeader
      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
    >
      {label}
    </TableCell>
  );

  return (
    <div className="overflow-hidden bg-white border border-gray-200 rounded-2xl dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-gray-800">
            <TableRow>
              {showCheck && (
                <TableCell
                  isHeader
                  className="px-5 py-3 text-start"
                >
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={!!allChecked}
                    onChange={() => onToggleCheckAll?.()}
                    className="h-4 w-4 rounded accent-brand-500"
                  />
                </TableCell>
              )}
              <SortableTh label="Product" col="name" />
              {plainTh("SKU")}
              {plainTh("Category")}
              {plainTh("Type")}
              {plainTh("Price")}
              {plainTh("Status")}
              <SortableTh label="Created" col="created" />
              <SortableTh label="Updated" col="updated" />
              {showActions && plainTh("Actions")}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {products.map((product) => (
              <TableRow
                key={product.id}
                onClick={
                  onRowClick
                    ? (e) =>
                        onRowClick(
                          product,
                          e.currentTarget.getBoundingClientRect()
                        )
                    : undefined
                }
                className={`${onRowClick ? "cursor-pointer" : ""} ${
                  selectedId === product.id
                    ? "bg-brand-50 dark:bg-brand-500/10"
                    : onRowClick
                    ? "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    : ""
                }`}
              >
                {showCheck && (
                  <TableCell className="px-5 py-4 text-start">
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name}`}
                      checked={checkedIds!.has(product.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleCheck!(product.id)}
                      className="h-4 w-4 rounded accent-brand-500"
                    />
                  </TableCell>
                )}
                <TableCell className="px-5 py-4 text-start">
                  <Link
                    to={`/product/${product.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 group"
                  >
                    <Thumb product={product} />
                    <div>
                      <span className="flex items-center gap-1.5 font-medium text-gray-800 text-theme-sm group-hover:text-brand-500 dark:text-white/90">
                        {product.featured && (
                          <svg
                            className="w-4 h-4 shrink-0 text-warning-400"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-label="Featured"
                          >
                            <title>Featured</title>
                            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
                          </svg>
                        )}
                        {product.name}
                      </span>
                    </div>
                  </Link>
                </TableCell>

                <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {product.sku ?? "—"}
                </TableCell>

                <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {product.category?.name ?? "—"}
                </TableCell>

                <TableCell className="px-5 py-4 text-start">
                  <Badge
                    size="sm"
                    color={product.kind === "variable" ? "info" : "light"}
                  >
                    {product.kind}
                  </Badge>
                </TableCell>

                <TableCell className="px-5 py-4 text-start text-theme-sm">
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {formatPrice(product)}
                  </span>
                  {product.sale_price_cents !== null && (
                    <span className="block text-gray-400 line-through text-theme-xs">
                      {formatCents(product.sale_price_cents)}
                    </span>
                  )}
                </TableCell>

                <TableCell className="px-5 py-4 text-start">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {product.approval_status === "pending" ? (
                      <Badge size="sm" color="warning">
                        Pending approval
                      </Badge>
                    ) : product.approval_status === "rejected" ? (
                      <Badge size="sm" color="error">
                        Rejected
                      </Badge>
                    ) : (
                      <Badge
                        size="sm"
                        color={product.published ? "success" : "warning"}
                      >
                        {product.published ? "Published" : "Draft"}
                      </Badge>
                    )}
                    <Badge size="sm" color={product.in_stock ? "success" : "error"}>
                      {product.in_stock ? "In stock" : "Out of stock"}
                    </Badge>
                  </div>
                </TableCell>

                <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400 whitespace-nowrap">
                  {fmtDate(product.created_at)}
                </TableCell>

                <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400 whitespace-nowrap">
                  {fmtDate(product.updated_at)}
                </TableCell>

                {showActions && (
                  <TableCell className="px-5 py-4 text-start">
                    {/* Actions have their own behavior — don't let a click here
                        also select the row. */}
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canEdit && (
                        <Link
                          to={`/product/${product.slug}/edit`}
                          title="Edit"
                          aria-label="Edit product"
                          className={editIconBtn}
                        >
                          {/* pencil */}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </Link>
                      )}
                      {(onActivity || onDuplicate || onDelete) && (
                        <RowMenu>
                          {onActivity && (
                            <MenuItem onClick={() => onActivity(product)}>
                              {/* history */}
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3v5h5" />
                                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                                <path d="M12 7v5l3 3" />
                              </svg>
                              View activity
                            </MenuItem>
                          )}
                          {onDuplicate && (
                            <MenuItem
                              disabled={
                                duplicatingId === product.id ||
                                product.approval_status === "pending"
                              }
                              title={
                                product.approval_status === "pending"
                                  ? "Can't duplicate a product that's pending approval"
                                  : undefined
                              }
                              onClick={() => onDuplicate(product)}
                            >
                              {/* copy */}
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              {duplicatingId === product.id
                                ? "Duplicating…"
                                : "Duplicate"}
                            </MenuItem>
                          )}
                          {onDelete && (
                            <MenuItem
                              danger
                              disabled={deletingId === product.id}
                              onClick={() => onDelete(product)}
                            >
                              {/* trash */}
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                              {deletingId === product.id ? "Deleting…" : "Delete"}
                            </MenuItem>
                          )}
                        </RowMenu>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
