import { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import MediaPicker from "../components/media/MediaPicker";
import { Modal } from "../components/ui/modal";
import { supabase } from "../lib/supabase";
import { updateUserProfile } from "../lib/users";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

type ProfileView = {
  full_name: string | null;
  avatar_url: string | null;
  roleName: string | null;
  companyName: string | null;
};

export default function UserProfiles() {
  const { session, isAdmin } = useAuth();
  const { notify } = useToast();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? "";

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit modal state.
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role_id, company_id")
      .eq("id", userId)
      .maybeSingle();

    const roleId = (p as { role_id?: string | null } | null)?.role_id ?? null;
    const companyId =
      (p as { company_id?: string | null } | null)?.company_id ?? null;

    let roleName: string | null = isAdmin ? "Super Admin" : null;
    if (!isAdmin && roleId) {
      const { data: r } = await supabase
        .from("roles")
        .select("name")
        .eq("id", roleId)
        .maybeSingle();
      roleName = (r as { name?: string } | null)?.name ?? null;
    }

    let companyName: string | null = null;
    if (companyId) {
      const { data: c } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();
      companyName = (c as { name?: string } | null)?.name ?? null;
    }

    setProfile({
      full_name: p?.full_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      roleName,
      companyName,
    });
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = () => {
    setEditName(profile?.full_name ?? "");
    setEditAvatar(profile?.avatar_url ?? null);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await updateUserProfile(userId, {
      full_name: editName.trim() || null,
      avatar_url: editAvatar,
    });
    setSaving(false);
    if (error) return notify("error", "Could not save", error);
    notify("success", "Profile updated", "Your changes were saved.");
    setEditOpen(false);
    load();
  };

  const displayName = profile?.full_name?.trim() || email || "Your profile";
  const initial = (profile?.full_name || email || "?").charAt(0).toUpperCase();

  return (
    <>
      <PageMeta
        title="My Profile | FusionEdge"
        description="Your account details"
      />
      <PageBreadcrumb pageTitle="Profile" />

      {loading ? (
        <div className={shell}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity card */}
          <div className={`${shell} flex flex-col gap-6 sm:flex-row sm:items-center`}>
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="object-cover w-24 h-24 rounded-full shrink-0 border border-gray-200 dark:border-gray-800"
              />
            ) : (
              <div className="flex items-center justify-center w-24 h-24 text-3xl font-semibold text-white rounded-full shrink-0 bg-brand-500">
                {initial}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {displayName}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-all">
                {email}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {profile?.roleName && (
                  <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-theme-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    {profile.roleName}
                  </span>
                )}
                {profile?.companyName && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {profile.companyName}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={openEdit}
              className="h-11 shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Edit profile
            </button>
          </div>

          {/* Details */}
          <div className={shell}>
            <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
              Account details
            </h4>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div>
                <dt className="text-theme-xs text-gray-400">Full name</dt>
                <dd className="mt-1 text-sm text-gray-800 dark:text-white/90">
                  {profile?.full_name || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-400">Email</dt>
                <dd className="mt-1 text-sm text-gray-800 break-all dark:text-white/90">
                  {email || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-400">Role</dt>
                <dd className="mt-1 text-sm text-gray-800 dark:text-white/90">
                  {profile?.roleName || "No role"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-400">Company</dt>
                <dd className="mt-1 text-sm text-gray-800 dark:text-white/90">
                  {profile?.companyName || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        className="max-w-lg w-full p-6"
      >
        <h4 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit profile
        </h4>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Update your name and photo.
        </p>

        <div className="space-y-5">
          <div>
            <Label>Photo</Label>
            <div className="flex items-center gap-3">
              {editAvatar ? (
                <img
                  src={editAvatar}
                  alt="Avatar"
                  className="object-cover w-16 h-16 rounded-full border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="flex items-center justify-center w-16 h-16 text-xl font-semibold text-white rounded-full bg-brand-500">
                  {initial}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {editAvatar ? "Change photo" : "Choose photo"}
                </button>
                {editAvatar && (
                  <button
                    type="button"
                    onClick={() => setEditAvatar(null)}
                    className="h-11 rounded-lg px-3 text-sm font-medium text-gray-400 hover:text-error-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>Full name</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div>
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => setEditOpen(false)}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>

      <MediaPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => setEditAvatar(url)}
      />
    </>
  );
}
