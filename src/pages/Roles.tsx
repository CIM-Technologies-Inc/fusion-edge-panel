import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import { useToast } from "../context/ToastContext";
import { useRoles } from "../hooks/useRoles";
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
]);
const matrixResources = (isCompany: boolean) =>
  isCompany
    ? RESOURCES.filter((r) => !COMPANY_HIDDEN_RESOURCES.has(r))
    : [...RESOURCES];

export default function Roles() {
  const { roles, rolePerms, loading, reload } = useRoles();
  const { notify } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which role's full permission list is expanded in the list.
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    reload();
  };

  return (
    <div>
      <PageMeta title="Roles & permissions | FusionEdge" description="Manage roles and their permissions" />
      <PageBreadcrumb pageTitle="Roles & permissions" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Role list */}
        <div className="lg:col-span-1">
          <div className="flex justify-end mb-3">
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
                {roles.map((r) => {
                  const perms = rolePerms.get(r.id) ?? [];
                  const isOpen = expandedId === r.id;
                  return (
                    <li
                      key={r.id}
                      className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
                    >
                      <div
                        className={`flex w-full items-center gap-2 px-5 py-3 ${
                          selectedId === r.id
                            ? "bg-brand-50 dark:bg-brand-500/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
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
                        {/* Total permissions — click to show all. */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isOpen ? null : r.id)
                          }
                          title="Show all permissions"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-theme-xs font-medium ${
                            isOpen
                              ? "bg-brand-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300"
                          }`}
                        >
                          {r.is_system ? "all" : perms.length}
                          <svg
                            className={`w-3 h-3 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
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
                      </div>

                      {isOpen && (
                        <div className="px-5 pb-3">
                          {r.is_system ? (
                            <p className="text-theme-xs text-gray-400">
                              Full access to everything.
                            </p>
                          ) : perms.length === 0 ? (
                            <p className="text-theme-xs text-gray-400">
                              No permissions granted.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {perms.map((p) => (
                                <span
                                  key={p}
                                  className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {!selected ? (
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
                  This is a system role. Its permissions are managed
                  automatically and can't be edited here.
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
                        {/* Each resource fills the 4 action columns. Approval
                            has its own actions (approve/reject) shown in the
                            first columns, with the rest dashed out. */}
                        {ACTIONS.map((a, i) => {
                          const acts = actionsFor(res);
                          // Approval row: put approve/reject in the first slots.
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
                          // Brand viewing is always open (it's governed by
                          // Company access), so there's no "view" toggle for it.
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

              {/* Extra product action: feature products. Staff-only (a company
                  user can't feature), so hidden for company roles. */}
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
                      Lets this role mark products as Featured (they sort to the
                      top).
                    </span>
                  </span>
                </label>
              )}

              {/* Extra product action: edit stock. Available to any role
                  (company or staff). */}
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
                      Lets this role change a product's inventory quantity
                      without full edit access.
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
                      Lets this role change a product's price and sale price
                      without full edit access.
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
          )}
        </div>
      </div>

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
