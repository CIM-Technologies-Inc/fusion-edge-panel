import { Outlet } from "react-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Gate the whole admin panel to STAFF only. Customers share the same Supabase
 * project as the storefront (react-fusion), so a customer could sign in here
 * with their storefront account — this stops them at the door instead of
 * showing an empty admin shell.
 *
 * "Staff" = an admin, anyone holding admin permissions, a company user, or the
 * legacy staff/supplier roles. A plain customer (role 'customer', no role_id,
 * no company) is denied and offered a sign-out.
 *
 * Nests INSIDE RequireAuth, so `session` is guaranteed here.
 */
export default function RequireStaff() {
  const { isAdmin, role, companyId, permissions, signOut } = useAuth();

  const isStaff =
    isAdmin ||
    permissions.size > 0 ||
    companyId !== null ||
    role === "staff" ||
    role === "supplier";

  if (isStaff) return <Outlet />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <h1 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
          No admin access
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          This account doesn’t have access to the admin panel. If you’re a
          customer, please shop from the storefront instead.
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="h-11 w-full rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
