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
};

const editIconBtn =
  "flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-white/[0.06]";

export default function ProductTable({
  products,
  canEdit,
  onDuplicate,
  onDelete,
  onActivity,
  duplicatingId,
  deletingId,
}: Props) {
  const showActions = !!canEdit || !!onDuplicate || !!onDelete || !!onActivity;
  const headers = ["Product", "SKU", "Category", "Type", "Price", "Status"];
  if (showActions) headers.push("Actions");

  return (
    <div className="overflow-hidden bg-white border border-gray-200 rounded-2xl dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-gray-800">
            <TableRow>
              {headers.map((h) => (
                <TableCell
                  key={h}
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="px-5 py-4 text-start">
                  <Link
                    to={`/product/${product.slug}`}
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
                      <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                        {product.slug}
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

                {showActions && (
                  <TableCell className="px-5 py-4 text-start">
                    <div className="flex items-center gap-1.5">
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
