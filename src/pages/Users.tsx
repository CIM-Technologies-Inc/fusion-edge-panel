import { useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import { ListToolbar, Pager } from "../components/common/ListControls";
import { useUsers } from "../hooks/useUsers";
import { useTableControls } from "../hooks/useTableControls";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  ROLE_LABEL,
  createUser,
  deleteUser,
  inviteUser,
  setUserBanned,
  setUserRole,
  updateUserProfile,
  type AdminUser,
  type UserRole,
} from "../lib/users";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";
const inputClass =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

// Roles an admin can assign from the UI. "customer" (default signup role) and
// "staff" are intentionally omitted.
const ROLES: UserRole[] = ["admin", "supplier"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Users() {
  const { users, loading, error, reload } = useUsers();
  const { session } = useAuth();
  const { notify } = useToast();
  const myId = session?.user?.id;

  // Add-user modal.
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("supplier");
  const [saving, setSaving] = useState(false);

  // Edit-name modal.
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");

  // Row-level "busy" so buttons disable while their action runs.
  const [busyId, setBusyId] = useState<string | null>(null);

  const controls = useTableControls({
    rows: users,
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
    setSaving(true);
    const { error } =
      mode === "invite"
        ? await inviteUser(email.trim(), newRole, fullName.trim() || undefined)
        : await createUser(email.trim(), {
            password,
            full_name: fullName.trim() || undefined,
            role: newRole,
          });
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

  const handleRole = async (u: AdminUser, role: UserRole) => {
    if (role === u.role) return;
    setBusyId(u.id);
    const { error } = await setUserRole(u.id, role);
    setBusyId(null);
    if (error) return notify("error", "Could not change role", error);
    notify("success", "Role updated", `${u.email ?? "User"} → ${ROLE_LABEL[role]}`);
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
    const { error } = await updateUserProfile(editUser.id, {
      full_name: editName.trim() || null,
    });
    if (error) return notify("error", "Could not update", error);
    notify("success", "Profile updated", editUser.email ?? "");
    setEditUser(null);
    reload();
  };

  return (
    <div>
      <PageMeta title="Users | FusionEdge" description="Manage users and roles" />
      <PageBreadcrumb pageTitle="Users" />

      <div className="space-y-6">
        <div className="flex justify-end">
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
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Status</th>
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
                        <td className="px-5 py-3">
                          <select
                            value={u.role}
                            disabled={busy || (isSelf && u.role === "admin")}
                            onChange={(e) =>
                              handleRole(u, e.target.value as UserRole)
                            }
                            className={`${inputClass} h-9 disabled:opacity-50`}
                            title={
                              isSelf && u.role === "admin"
                                ? "You can't remove your own admin role"
                                : undefined
                            }
                          >
                            {/* Include the user's current role even if it's
                                not assignable (e.g. customer), so the row shows
                                it and can be promoted. */}
                            {(ROLES.includes(u.role)
                              ? ROLES
                              : [u.role, ...ROLES]
                            ).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
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
                          {fmtDate(u.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditUser(u);
                                setEditName(u.full_name ?? "");
                              }}
                              className="text-gray-500 hover:text-brand-500"
                            >
                              Edit
                            </button>
                            {!isSelf && (
                              <>
                                <span className="text-gray-300 dark:text-gray-700">
                                  |
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleBan(u)}
                                  className="text-gray-500 hover:text-warning-500 disabled:opacity-50"
                                >
                                  {u.banned_at ? "Reactivate" : "Deactivate"}
                                </button>
                                <span className="text-gray-300 dark:text-gray-700">
                                  |
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDelete(u)}
                                  className="text-gray-400 hover:text-error-500 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
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
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className={`${inputClass} w-full`}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
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
    </div>
  );
}
