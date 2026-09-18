import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Gate for product-management routes: admins (full access) and suppliers
 * (their own products only, enforced by RLS). Other signed-in users are shown
 * an access notice; signed-out users go to sign-in.
 */
export default function RequireProductManager() {
  const { session, isAdmin, can, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500 dark:text-gray-400">Checking access…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin && !can("product", "view")) {
    return (
      <div className="p-6 text-center border border-gray-200 rounded-2xl bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
          Access required
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your account can’t manage products. Ask an admin for access.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
