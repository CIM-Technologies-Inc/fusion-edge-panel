import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import { useToast } from "../context/ToastContext";
import { useRoles, type Role } from "../hooks/useRoles";
import {
  ACTIONS,
  RESOURCES,
  RESOURCE_LABEL,
  actionsFor,
  countRoleUsers,
  countRoleUsersWithCompany,
  createRole,
  deleteRole,
  getRolePermissions,
  reorderRoles,
  setRolePermissions,
  updateRole,
  type PermKey,
} from "../lib/roles";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

// A company role is scoped to its own company's data. Global/admin concerns
// (Categories, Users) don't apply, it can't manage companies itself, and it
// can't approve products (a company can't approve its own submissions) — so
// the matrix hides those rows for such roles.
// Users is now allowed for company roles (they manage their own company's
// users). Categories, Company management, and Approval stay admin/staff-only.
const COMPANY_HIDDEN_RESOURCES = new Set([
  "category",
  "company",
  "approval",
  "role",
]);
const matrixResources = (isCompany: boolean) =>
  isCompany
    ? RESOURCES.filter((r) => !COMPANY_HIDDEN_RESOURCES.has(r))
    : [...RESOURCES];

export default function Roles() {
  const { roles, loading, reload } = useRoles();
  const { notify } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCompany, setIsCompany] = useState(false);
  const [perms, setPerms] = useState<Set<PermKey>>(new Set());
  // How many users hold the selected role — used to lock the company toggle.
  const [assignedCount, setAssignedCount] = useState(0);
  const [savingPerms, setSavingPerms] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);

  // Add-role modal.
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIsCompany, setNewIsCompany] = useState(false);
  const [creating, setCreating] = useState(false);

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  // On mobile the editor opens as a slide-in drawer instead of a side column.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Local, drag-reorderable copy of the role list. Kept in sync with the
  // fetched roles; drag writes the new order back to the DB.
  const [order, setOrder] = useState<Role[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    setOrder(roles);
  }, [roles]);

  const handleDrop = async (targetId: string) => {
    const from = order.findIndex((r) => r.id === dragId);
    const to = order.findIndex((r) => r.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from === -1 || to === -1 || from === to) return;

    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next); // optimistic

    const { error } = await reorderRoles(next.map((r) => r.id));
    if (error) {
      notify("error", "Couldn't save order", error);
      setOrder(roles); // revert
    }
  };

  // Load the selected role's fields + permissions.
  useEffect(() => {
    if (!selectedId) return;
    const role = roles.find((r) => r.id === selectedId);
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setIsCompany(role.is_company);
    }
    setLoadingPerms(true);
    getRolePermissions(selectedId).then(({ perms }) => {
      setPerms(perms);
      setLoadingPerms(false);
    });
    setAssignedCount(0);
    countRoleUsers(selectedId).then(setAssignedCount);
  }, [selectedId, roles]);

  const toggle = (key: PermKey) =>
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Tick/untick a whole resource row. Brand has no "view" toggle (viewing is
  // always open), so it's excluded from the row's keys.
  const toggleRow = (resource: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      const keys = actionsFor(resource)
        .filter((a) => !(resource === "brand" && a === "view"))
        .map((a) => `${resource}.${a}` as PermKey);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  const handleSave = async () => {
    if (!selected) return;

    // Can't flip the company flag while users are assigned — that would break
    // their company assignments. Reassign them first.
    if (isCompany !== selected.is_company && assignedCount > 0) {
      notify(
        "error",
        "Can't change this",
        `${assignedCount} user${
          assignedCount > 1 ? "s are" : " is"
        } assigned to this role. Reassign them before changing whether it's a company role.`
      );
      return;
    }

    // Guard: a role can't gain a company permission while it's assigned to
    // users who have a company — that would create the invalid combination
    // (company-managing role + company-bound users).
    const wantsCompanyPerm = [...perms].some((k) => k.startsWith("company."));
    if (wantsCompanyPerm) {
      const withCompany = await countRoleUsersWithCompany(selected.id);
      if (withCompany > 0) {
        notify(
          "error",
          "Can't add company permission",
          `This role is assigned to ${withCompany} user${
            withCompany > 1 ? "s" : ""
          } who have a company. Remove their company first, or don't grant company access.`
        );
        return;
      }
    }

    setSavingPerms(true);
    // Save name/description/company-flag then permissions.
    const u = await updateRole(selected.id, name, description, isCompany);
    if (u.error) {
      setSavingPerms(false);
      notify("error", "Save failed", u.error);
      return;
    }
    // A company role never persists permissions for hidden (global) resources,
    // nor the staff-only product.feature action.
    const cleaned = isCompany
      ? new Set(
          [...perms].filter(
            (k) =>
              !COMPANY_HIDDEN_RESOURCES.has(k.split(".")[0]) &&
              k !== "product.feature"
          )
        )
      : perms;
    const p = await setRolePermissions(selected.id, cleaned);
    setSavingPerms(false);
    if (p.error) {
      notify("error", "Permissions failed", p.error);
      return;
    }
    notify("success", "Role saved", name);
    reload();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { id, error } = await createRole(
      newName,
      newDesc || null,
      newIsCompany
    );
    setCreating(false);
    if (error || !id) {
      notify("error", "Could not create role", error ?? "Failed.");
      return;
    }
    notify("success", "Role created", newName.trim());
    setAddOpen(false);
    setNewName("");
    setNewDesc("");
    setNewIsCompany(false);
    reload();
    setSelectedId(id);
  };

  const handleDelete = async () => {
    if (!selected) return;
    // A role with users assigned can't be deleted — reassign them first.
    const uses = await countRoleUsers(selected.id);
    if (uses > 0) {
      return notify(
        "error",
        "Can't delete this role",
        `"${selected.name}" is assigned to ${uses} user${
          uses > 1 ? "s" : ""
        }. Reassign ${uses > 1 ? "them" : "that user"} to another role first.`
      );
    }
    if (!window.confirm(`Delete the role "${selected.name}"?`)) return;
    const { error } = await deleteRole(selected.id);
    if (error) return notify("error", "Delete failed", error);
    notify("info", "Role deleted", selected.name);
    setSelectedId(null);
    setDrawerOpen(false);
    reload();
  };

  // The editor body — reused in the desktop column and the mobile drawer.
  const editor = !selected ? (
    <div className={`${shell} text-center`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select a role to edit its permissions, or create a new one.
      </p>
    </div>
  ) : (
    <div className={`${shell} space-y-5`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Role name</Label>
          <Input
            value={name}
            disabled={selected.is_system}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {!selected.is_system && (
        <label
          className={`flex items-start gap-3 ${
            assignedCount > 0 ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            checked={isCompany}
            disabled={assignedCount > 0}
            onChange={(e) => setIsCompany(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500 disabled:opacity-50"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              For company users
            </span>
            <span className="block text-theme-xs text-gray-400">
              {assignedCount > 0
                ? `Locked — ${assignedCount} user${
                    assignedCount > 1 ? "s are" : " is"
                  } assigned to this role. Reassign them first to change this.`
                : "Hides global permissions (Categories, Users) — this role only manages its company's own data."}
            </span>
          </span>
        </label>
      )}

      {selected.is_system && (
        <p className="text-theme-xs text-gray-400">
          This is a system role. Its permissions are managed automatically and
          can't be edited here.
        </p>
      )}

      {/* Permission matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
              <th className="py-2 pr-3 font-medium">Resource</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-3 py-2 font-medium capitalize text-center">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixResources(isCompany).map((res) => (
              <tr
                key={res}
                className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
              >
                <td className="py-2.5 pr-3">
                  <button
                    type="button"
                    disabled={selected.is_system || loadingPerms}
                    onClick={() => toggleRow(res)}
                    className="font-medium text-gray-700 hover:text-brand-500 disabled:hover:text-gray-700 dark:text-gray-300"
                    title="Toggle all"
                  >
                    {RESOURCE_LABEL[res]}
                  </button>
                </td>
                {ACTIONS.map((a, i) => {
                  const acts = actionsFor(res);
                  if (res === "approval") {
                    const act = acts[i];
                    if (!act) {
                      return (
                        <td key={a} className="px-3 py-2.5 text-center text-gray-300 dark:text-gray-600">
                          —
                        </td>
                      );
                    }
                    const key = `approval.${act}` as PermKey;
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        <label className="inline-flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            checked={perms.has(key)}
                            disabled={selected.is_system || loadingPerms}
                            onChange={() => toggle(key)}
                            className="w-4 h-4 rounded accent-brand-500 disabled:opacity-50"
                          />
                          <span className="text-[10px] capitalize text-gray-400">
                            {act}
                          </span>
                        </label>
                      </td>
                    );
                  }

                  const key = `${res}.${a}` as PermKey;
                  if (res === "brand" && a === "view") {
                    return (
                      <td
                        key={a}
                        className="px-3 py-2.5 text-center text-gray-300 dark:text-gray-600"
                        title="Brands are visible to anyone who can open their company"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={a} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={perms.has(key)}
                        disabled={selected.is_system || loadingPerms}
                        onChange={() => toggle(key)}
                        className="w-4 h-4 rounded accent-brand-500 disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Extra product action: feature products. Staff-only. */}
      {!isCompany && !selected.is_system && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={perms.has("product.feature")}
            disabled={loadingPerms}
            onChange={() => toggle("product.feature")}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500 disabled:opacity-50"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Feature products
            </span>
            <span className="block text-theme-xs text-gray-400">
              Lets this role mark products as Featured (they sort to the top).
            </span>
          </span>
        </label>
      )}

      {/* Extra product action: edit stock. */}
      {!selected.is_system && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={perms.has("product.stock")}
            disabled={loadingPerms}
            onChange={() => toggle("product.stock")}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500 disabled:opacity-50"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Edit stock
            </span>
            <span className="block text-theme-xs text-gray-400">
              Lets this role change a product's inventory quantity without full
              edit access.
            </span>
          </span>
        </label>
      )}

      {/* Extra product action: edit pricing (price + sale price). */}
      {!selected.is_system && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={perms.has("product.price")}
            disabled={loadingPerms}
            onChange={() => toggle("product.price")}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500 disabled:opacity-50"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Edit pricing
            </span>
            <span className="block text-theme-xs text-gray-400">
              Lets this role change a product's price and sale price without full
              edit access.
            </span>
          </span>
        </label>
      )}

      <div className="flex justify-between gap-3 pt-2">
        {!selected.is_system ? (
          <button
            type="button"
            onClick={handleDelete}
            className="h-11 rounded-lg px-4 text-sm font-medium text-gray-500 hover:text-error-500"
          >
            Delete role
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={selected.is_system || savingPerms}
          className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {savingPerms ? "Saving…" : "Save role"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <PageMeta title="Roles & permissions | FusionEdge" description="Manage roles and their permissions" />
      <PageBreadcrumb pageTitle="Roles & permissions" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Role list */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-theme-xs text-gray-400">
              Drag to reorder
            </span>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center h-10 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
            >
              + New role
            </button>
          </div>
          <div className={`${shell} p-0 overflow-hidden`}>
            {loading ? (
              <p className="p-5 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            ) : roles.length === 0 ? (
              <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
                No roles yet.
              </p>
            ) : (
              <ul>
                {order.map((r) => (
                  <li
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (overId !== r.id) setOverId(r.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(r.id);
                    }}
                    className={`border-b border-gray-50 last:border-0 dark:border-gray-800/60 ${
                      dragId === r.id ? "opacity-40" : ""
                    } ${
                      overId === r.id && dragId !== r.id
                        ? "border-t-2 border-t-brand-500"
                        : ""
                    }`}
                  >
                    <div
                      className={`flex w-full items-center gap-2 px-3 py-3 ${
                        selectedId === r.id
                          ? "bg-brand-50 dark:bg-brand-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      {/* drag handle */}
                      <span
                        className="cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing dark:text-gray-600"
                        title="Drag to reorder"
                        aria-hidden
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(r.id);
                          setDrawerOpen(true);
                        }}
                        className="flex-1 text-left font-medium text-gray-800 dark:text-white/90"
                      >
                        {r.name}
                      </button>
                      {r.is_company && (
                        <Badge size="sm" color="primary">
                          company
                        </Badge>
                      )}
                      {r.is_system && (
                        <Badge size="sm" color="light">
                          system
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Editor — side column on desktop, slide-in drawer on mobile. */}
        <div className="hidden lg:col-span-2 lg:block">{editor}</div>
      </div>

      {/* Mobile editor drawer */}
      {drawerOpen && (
        <div className="lg:hidden">
          {/* backdrop */}
          <div
            className="fixed inset-0 z-[99999] bg-gray-900/40 backdrop-blur-[1px]"
            onClick={() => setDrawerOpen(false)}
          />
          {/* panel */}
          <aside
            className="fixed right-0 top-0 z-[100000] flex h-screen w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
            role="dialog"
            aria-label="Edit role"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {selected ? selected.name : "Role"}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Permissions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{editor}</div>
          </aside>
        </div>
      )}

      {/* New role modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} className="max-w-md w-full p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          New role
        </h3>
        <div className="space-y-5">
          <div>
            <Label>Name</Label>
            <Input
              value={newName}
              placeholder="e.g. Manager"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={newDesc}
              placeholder="What this role is for"
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newIsCompany}
              onChange={(e) => setNewIsCompany(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                For company users
              </span>
              <span className="block text-theme-xs text-gray-400">
                Hides global permissions (Categories, Users) — this role only
                manages its company's own data.
              </span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create role"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
