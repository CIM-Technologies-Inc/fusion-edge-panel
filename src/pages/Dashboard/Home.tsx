import CatalogueDashboard from "../../components/dashboard/CatalogueDashboard";
import CompanyDashboard from "../../components/dashboard/CompanyDashboard";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";

export default function Home() {
  const { isAdmin, companyId, loading } = useAuth();

  // Admins get the full catalogue dashboard; a company user gets their own.
  const showCompany = !loading && !isAdmin && !!companyId;

  return (
    <>
      <PageMeta
        title="Dashboard | FusionEdge"
        description="Your overview — products, media, and what needs attention."
      />
      {showCompany ? <CompanyDashboard /> : <CatalogueDashboard />}
    </>
  );
}
