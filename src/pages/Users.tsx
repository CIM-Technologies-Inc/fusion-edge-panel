import { useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import { ListToolbar, Pager } from "../components/common/ListControls";
import { useUsers } from "../hooks/useUsers";
import { useRoles } from "../hooks/useRoles";
import { useCompanies } from "../hooks/useCompanies";
import { useTableControls } from "../hooks/useTableControls";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  createUser,
  deleteUser,
  inviteUser,
  setUserBanned,
  setUserCompany,
  setUserRoleId,
  updateUserProfile,
  type AdminUser,
  type UserRole,
} from "../lib/users";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Relative "ago" when within 24h, otherwise the date. */
function fmtLastActive(iso: string | null) {
  if (!iso) return "Never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return fmtDate(iso);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return fmtDate(iso);
}

export default function Users() {
  const { users, loading, error, reload } = useUsers();
  const { roles, rolePerms, roleHasResource } = useRoles();
  const { companies } = useCompanies();
  const { session, can, isAdmin, companyId } = useAuth();
  const { notify } = useToast();
  const myId = session?.user?.id;

  // Add-user modal.
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("supplier");
  // New permission-based role + company assignment.
  const [newRoleId, setNewRoleId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [saving, setSaving] = useState(false);
  // Which user's permission list is expanded in the table.
  // Permissions popover: which user, anchored to the clicked chip's position.
  const [permPopover, setPermPopover] = useState<{
    userId: string;
    x: number;
    y: number;
  } | null>(null);

  // A company can be assigned to a user ONLY when their role is a "company
  // role" (roles.is_company). A role that manages companies (has the company
  // permission) is never tied to one, so it's excluded even if flagged.
  const isCompanyRole = (roleId: string) =>
    !!roleId &&
    (roles.find((r) => r.id === roleId)?.is_company ?? false) &&
    !roleHasResource(roleId, "company");

  // If the chosen role can manage companies, the user isn't tied to one company
  // — so don't let the admin pick a company for them.
  const roleManagesCompany =
    !!newRoleId && roleHasResource(newRoleId, "company");
  const newCanAssignCompany = isCompanyRole(newRoleId);

  // Edit-user modal (name + role + company).
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const editRoleManagesCompany =
    !!editRoleId && roleHasResource(editRoleId, "company");
  const editCanAssignCompany = isCompanyRole(editRoleId);

  // Row-level "busy" so buttons disable while their action runs.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Filter the list by assigned role. "" = all roles.
  const [roleFilter, setRoleFilter] = useState("");

  const filteredUsers = useMemo(
    () => (roleFilter ? users.filter((u) => u.role_id === roleFilter) : users),
    [users, roleFilter]
  );

  // Roles a company-user may assign: only those already in use in their own
  // company. Admins/staff can assign any role.
  const isCompanyManager = !isAdmin && !!companyId;
  const assignableRoles = useMemo(() => {
    if (!isCompanyManager) return roles;
    const inUse = new Set(
      users.map((u) => u.role_id).filter((id): id is string => !!id)
    );
    return roles.filter((r) => inUse.has(r.id));
  }, [roles, users, isCompanyManager]);

  const controls = useTableControls({
    rows: filteredUsers,
    searchFields: (u) => [u.full_name, u.email, u.role],
    sorters: {
      name: (a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""),
      email: (a, b) => (a.email ?? "").localeCompare(b.email ?? ""),
      role: (a, b) => a.role.localeCompare(b.role),
      joined: (a, b) => a.created_at.localeCompare(b.created_at),
    },
    initialSort: "joined",
    pageSize: 10,
  });

  const resetAdd = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setNewRole("supplier");
    setNewRoleId("");
    setNewCompanyId("");
    setMode("invite");
  };

  const handleAdd = async () => {
    if (!email.trim()) {
      notify("error", "Email required", "Enter an email address.");
      return;
    }
    if (mode === "create" && password.length < 6) {
      notify("error", "Weak password", "Use at least 6 characters.");
      return;
    }
    // A company can only be assigned to a company role.
    if (newCompanyId && !newCanAssignCompany) {
      notify(
        "error",
        "Can't assign a company",
        roleManagesCompany
          ? "This role manages companies, so it can't be tied to one."
          : "Only a company role can be assigned to a company."
      );
      return;
    }
    setSaving(true);
    const opts = {
      full_name: fullName.trim() || undefined,
      role_id: newRoleId || undefined,
      // Only a company role carries a company.
      company_id: newCanAssignCompany ? newCompanyId || undefined : undefined,
    };
    const { error } =
      mode === "invite"
        ? await inviteUser(email.trim(), { ...opts })
        : await createUser(email.trim(), { password, role: newRole, ...opts });
    setSaving(false);
    if (error) {
      notify("error", "Could not add user", error);
      return;
    }
    notify(
      "success",
      mode === "invite" ? "Invitation sent" : "User created",
      email.trim()
    );
    setAddOpen(false);
    resetAdd();
    reload();
  };

  const handleBan = async (u: AdminUser) => {
    const banning = !u.banned_at;
    if (
      !window.confirm(
        banning
          ? `Deactivate ${u.email ?? "this user"}? They won't be able to sign in.`
          : `Reactivate ${u.email ?? "this user"}?`
      )
    )
      return;
    setBusyId(u.id);
    const { error } = await setUserBanned(u.id, banning);
    setBusyId(null);
    if (error) return notify("error", "Action failed", error);
    notify("info", banning ? "User deactivated" : "User reactivated", u.email ?? "");
    reload();
  };

  const handleDelete = async (u: AdminUser) => {
    if (
      !window.confirm(
        `Permanently delete ${u.email ?? "this user"}? This cannot be undone.`
      )
    )
      return;
    setBusyId(u.id);
    const { error } = await deleteUser(u.id);
    setBusyId(null);
    if (error) return notify("error", "Delete failed", error);
    notify("info", "User deleted", u.email ?? "");
    reload();
  };

  const handleSaveName = async () => {
    if (!editUser) return;

    // A company can only be tied to a company role; otherwise it's cleared.
    const canAssign = editCanAssignCompany;
    const companyValue = canAssign ? editCompanyId || null : null;

    // 1) Name.
    const { error } = await updateUserProfile(editUser.id, {
      full_name: editName.trim() || null,
    });
    if (error) return notify("error", "Could not update", error);

    // 2) Role (if changed) — clear the company first if the new role can't hold
    //    one, so the guard trigger never sees an invalid role+company pair.
    if ((editRoleId || null) !== editUser.role_id) {
      if (!canAssign && editUser.company_id) {
        const c = await setUserCompany(editUser.id, null);
        if (c.error) return notify("error", "Could not clear company", c.error);
      }
      const r = await setUserRoleId(editUser.id, editRoleId || null);
      if (r.error) return notify("error", "Could not change role", r.error);
    }

    // 3) Company (only for a company role, and only if it changed).
    if (canAssign && companyValue !== editUser.company_id) {
      const c = await setUserCompany(editUser.id, companyValue);
      if (c.error) return notify("error", "Could not change company", c.error);
    }

    notify("success", "User updated", editUser.email ?? "");
    setEditUser(null);
    reload();
  };

  return (
    <div>
      <PageMeta title="Users | FusionEdge" description="Manage users and roles" />
      <PageBreadcrumb pageTitle="Users" />

      <div className="space-y-6">
        <div className="flex justify-end">
          {can("users", "add") && (
            <button
              type="button"
              onClick={() => {
                resetAdd();
                setAddOpen(true);
              }}
              className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600"
            >
              + Add user
            </button>
          )}
        </div>

        {error && (
          <div className={`${shell} border-error-300`}>
            <p className="text-sm text-error-500">
              Couldn’t load users: {error}. This page requires admin access and
              the 0003 migration.
            </p>
          </div>
        )}

        {loading ? (
          <div className={shell}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : users.length === 0 && !error ? (
          <div className={`${shell} text-center`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No users found.
            </p>
          </div>
        ) : (
          <>
            <ListToolbar
              query={controls.query}
              onQuery={controls.setQuery}
              placeholder="Search name, email or role"
              filters={
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  aria-label="Filter by role"
                  className="col-span-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:col-auto sm:w-auto"
                >
                  <option value="">All roles</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              }
              sortKey={controls.sortKey}
              onSortKey={controls.setSortKey}
              sortOptions={[
                { value: "joined", label: "Joined" },
                { value: "name", label: "Name" },
                { value: "email", label: "Email" },
                { value: "role", label: "Role" },
              ]}
              dir={controls.dir}
              onToggleDir={controls.toggleDir}
              summary={
                controls.total === 0
                  ? "No matches"
                  : `${controls.rangeStart}–${controls.rangeEnd} of ${controls.total}`
              }
            />

            <div className={`${shell} overflow-x-auto p-0`}>
              <table className="w-full text-sm min-w-[1040px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Permissions</th>
                    <th className="px-5 py-3 font-medium">Company</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Invited by</th>
                    <th className="px-5 py-3 font-medium">Last active</th>
                    <th className="px-5 py-3 font-medium">Joined</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {controls.rows.map((u) => {
                    const isSelf = u.id === myId;
                    const busy = busyId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-gray-50 last:border-0 dark:border-gray-800/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 overflow-hidden text-xs font-medium text-gray-500 bg-gray-100 rounded-full shrink-0 dark:bg-gray-800">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt=""
                                  className="object-cover w-full h-full"
                                />
                              ) : (
                                (u.full_name || u.email || "?")
                                  .charAt(0)
                                  .toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 truncate dark:text-white/90">
                                {u.full_name || "—"}
                                {isSelf && (
                                  <span className="ml-2 text-theme-xs text-gray-400">
                                    (you)
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-500 truncate dark:text-gray-400">
                                {u.email ?? "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                          {roles.find((r) => r.id === u.role_id)?.name ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          {(() => {
                            const count = u.is_admin
                              ? "all"
                              : (u.role_id
                                  ? rolePerms.get(u.role_id) ?? []
                                  : []
                                ).length;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  const r =
                                    e.currentTarget.getBoundingClientRect();
                                  setPermPopover(
                                    permPopover?.userId === u.id
                                      ? null
                                      : {
                                          userId: u.id,
                                          x: r.left,
                                          y: r.bottom + 6,
                                        }
                                  );
                                }}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-theme-xs font-medium ${
                                  permPopover?.userId === u.id
                                    ? "bg-brand-500 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300"
                                }`}
                              >
                                {count} perm{count === 1 ? "" : "s"}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                          {u.role_id && roleHasResource(u.role_id, "company")
                            ? "n/a"
                            : companies.find((c) => c.id === u.company_id)?.name ??
                              "—"}
                        </td>
                        <td className="px-5 py-3">
                          {u.banned_at ? (
                            <Badge size="sm" color="error">
                              Deactivated
                            </Badge>
                          ) : (
                            <Badge size="sm" color="success">
                              Active
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {u.invited_by_email ? (
                            <span className="truncate" title={u.invited_by_email}>
                              {u.invited_by_email}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {fmtLastActive(u.last_sign_in_at)}
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                          {fmtDate(u.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          {/* Actions follow the users permission. A company user
                              only ever sees their own company's users here. */}
                          {!(
                            can("users", "edit") || can("users", "delete")
                          ) ? (
                            <span className="block text-right text-theme-xs text-gray-300 dark:text-gray-600">
                              —
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {can("users", "edit") && (
                                <button
                                  type="button"
                                  title="Edit"
                                  aria-label="Edit user"
                                  onClick={() => {
                                    setEditUser(u);
                                    setEditName(u.full_name ?? "");
                                    setEditRoleId(u.role_id ?? "");
                                    setEditCompanyId(u.company_id ?? "");
                                  }}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-white/[0.06]"
                                >
                                  {/* pencil */}
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                </button>
                              )}
                              {!isSelf && can("users", "edit") && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title={u.banned_at ? "Reactivate" : "Deactivate"}
                                  aria-label={u.banned_at ? "Reactivate user" : "Deactivate user"}
                                  onClick={() => handleBan(u)}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-warning-500 disabled:opacity-50 dark:hover:bg-white/[0.06]"
                                >
                                  {u.banned_at ? (
                                    /* user-check */
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                      <path d="m16 11 2 2 4-4" />
                                    </svg>
                                  ) : (
                                    /* user-x */
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                      <path d="m17 8 5 5M22 8l-5 5" />
                                    </svg>
                                  )}
                                </button>
                              )}
                              {!isSelf && can("users", "delete") && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Delete"
                                  aria-label="Delete user"
                                  onClick={() => handleDelete(u)}
                                  className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-error-500 disabled:opacity-50 dark:hover:bg-white/[0.06]"
                                >
                                  {/* trash */}
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    <path d="M10 11v6M14 11v6" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {controls.total === 0 && (
                <p className="px-5 py-6 text-sm text-center text-gray-500 dark:text-gray-400">
                  No user matches “{controls.query}”.
                </p>
              )}
            </div>

            <Pager
              page={controls.page}
              pageCount={controls.pageCount}
              onPage={controls.setPage}
            />
          </>
        )}
      </div>

      {/* Add user (invite or create) */}
      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        className="max-w-lg w-full p-6"
      >
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Add user
        </h3>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          Invite sends an email to set their own password. Create makes a
          ready-to-use account with a password you set.
        </p>

        <div className="inline-flex p-1 mb-5 rounded-lg bg-gray-100 dark:bg-gray-800">
          {(["invite", "create"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-8 rounded-md px-4 text-sm font-medium capitalize transition ${
                mode === m
                  ? "bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white/90"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              placeholder="person@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Full name</Label>
            <Input
              value={fullName}
              placeholder="Jane Cruz"
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          {mode === "create" && (
            <>
              <div>
                <Label>Temporary password</Label>
                <Input
                  type="text"
                  value={password}
                  placeholder="At least 6 characters"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <Label>Role</Label>
            <select
              value={newRoleId}
              onChange={(e) => {
                const rid = e.target.value;
                setNewRoleId(rid);
                // Company can only be set for a company role — clear otherwise.
                if (!isCompanyRole(rid)) setNewCompanyId("");
              }}
              className={`${inputClass} w-full`}
            >
              <option value="">No role</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {newCanAssignCompany ? (
            <div>
              <Label>Company</Label>
              <select
                value={newCompanyId}
                onChange={(e) => setNewCompanyId(e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-theme-xs text-gray-400">
                Scopes their data to that company.
              </p>
            </div>
          ) : (
            <p className="text-theme-xs text-gray-400">
              {roleManagesCompany
                ? "This role manages companies, so it isn't tied to one."
                : "Only a company role can be assigned to a company. Mark the role “For company users” to enable this."}
            </p>
          )}
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
            onClick={handleAdd}
            disabled={saving || !email.trim()}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Working…" : mode === "invite" ? "Send invite" : "Create user"}
          </button>
        </div>
      </Modal>

      {/* Edit name */}
      <Modal
        isOpen={editUser !== null}
        onClose={() => setEditUser(null)}
        className="max-w-md w-full p-6"
      >
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit user
        </h3>
        {editUser && (
          <div className="space-y-5">
            <div>
              <Label>Email</Label>
              <Input value={editUser.email ?? ""} disabled />
            </div>
            <div>
              <Label>Full name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={editRoleId}
                disabled={editUser.id === myId && editUser.is_admin}
                onChange={(e) => {
                  const rid = e.target.value;
                  setEditRoleId(rid);
                  // Company can only be set for a company role — clear otherwise.
                  if (!isCompanyRole(rid)) setEditCompanyId("");
                }}
                className={`${inputClass} w-full disabled:opacity-50`}
                title={
                  editUser.id === myId && editUser.is_admin
                    ? "You can't change your own role"
                    : undefined
                }
              >
                <option value="">No role</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            {editCanAssignCompany ? (
              <div>
                <Label>Company</Label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className={`${inputClass} w-full`}
                >
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-theme-xs text-gray-400">
                {editRoleManagesCompany
                  ? "This role manages companies, so it isn't tied to one."
                  : "Only a company role can be assigned to a company. Mark the role “For company users” to enable this."}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => setEditUser(null)}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveName}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Save
          </button>
        </div>
      </Modal>

      {/* Permissions popover — fixed-position so the table's scroll can't clip it. */}
      {permPopover &&
        (() => {
          const pu = users.find((x) => x.id === permPopover.userId);
          const perms = pu?.is_admin
            ? null
            : pu?.role_id
            ? rolePerms.get(pu.role_id) ?? []
            : [];
          const groups = new Map<string, string[]>();
          for (const p of perms ?? []) {
            const [res, act] = p.split(".");
            const arr = groups.get(res) ?? [];
            arr.push(act);
            groups.set(res, arr);
          }
          const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          return (
            <>
              {/* click-away backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPermPopover(null)}
              />
              <div
                className="fixed z-50 w-72 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
                style={{
                  top: permPopover.y,
                  left: Math.min(
                    permPopover.x,
                    window.innerWidth - 300 // keep it on-screen
                  ),
                }}
              >
                <p className="mb-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {pu?.full_name || pu?.email || "User"}
                </p>
                <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
                  {roles.find((r) => r.id === pu?.role_id)?.name ?? "No role"}
                </p>
                {perms === null ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Developer — full access to everything.
                  </p>
                ) : perms.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No permissions.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {[...groups.entries()].map(([res, actions]) => (
                      <div key={res}>
                        <p className="mb-1 text-sm font-medium text-gray-800 dark:text-white/90">
                          {cap(res)}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {actions.map((a) => (
                            <span
                              key={a}
                              className="rounded-md bg-brand-50 px-2 py-0.5 text-theme-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                            >
                              {cap(a)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
        })()}
    </div>
  );
}
