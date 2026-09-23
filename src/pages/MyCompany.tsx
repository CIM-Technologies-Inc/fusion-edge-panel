import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const shell =
  "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

/**
 * Resolves the signed-in user's own company from their profile and redirects to
 * its detail page. Robust to the companies list not being loaded elsewhere —
 * it reads the company directly by the user's company_id.
 */
export default function MyCompany() {
  const { companyId, isAdmin } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setDone(true);
      return;
    }
    supabase
      .from("companies")
      .select("slug")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setSlug((data as { slug?: string } | null)?.slug ?? null);
        setDone(true);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  if (!companyId) {
    // No company — admins go to the full list, others have nowhere to go.
    return <Navigate to={isAdmin ? "/product/companies" : "/"} replace />;
  }
  if (slug) return <Navigate to={`/product/companies/${slug}`} replace />;
  if (done) {
    return (
      <div className={`${shell} text-center`}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Couldn't find your company.
        </p>
      </div>
    );
  }
  return (
    <div className={shell}>
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
    </div>
  );
}
