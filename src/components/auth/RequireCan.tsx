import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Route gate for a permission. Admins always pass; others need
 * can(resource, action). Signed-out users go to sign-in.
 *
 * Usage:  <Route element={<RequireCan resource="brand" action="view" />}>
 */
export default function RequireCan({
  resource,
  action = "view",
}: {
  resource: string;
  action?: string;
}) {
  const { session, isAdmin, can, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Checking access…
        </p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin && !can(resource, action)) {
    return (
      <div className="p-6 text-center border border-gray-200 rounded-2xl bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <h4 className="mb-1 font-medium text-gray-800 dark:text-white/90">
          Access required
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You don’t have permission to view this page.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
