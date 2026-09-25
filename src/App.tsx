import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import SetPassword from "./pages/AuthPages/SetPassword";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Videos from "./pages/UiElements/Videos";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import LineChart from "./pages/Charts/LineChart";
import BarChart from "./pages/Charts/BarChart";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import FormElements from "./pages/Forms/FormElements";
import Blank from "./pages/Blank";
import Product from "./pages/Product";
import ProductDetail from "./pages/ProductDetail";
import ProductEdit from "./pages/ProductEdit";
import ProductNew from "./pages/ProductNew";
import Media from "./pages/Media";
import Attributes from "./pages/Attributes";
import Categories from "./pages/Categories";
import Companies from "./pages/Companies";
import CompanyDetail from "./pages/CompanyDetail";
import MyCompany from "./pages/MyCompany";
import BulkPrices from "./pages/BulkPrices";
import Users from "./pages/Users";
import Roles from "./pages/Roles";
import Approvals from "./pages/Approvals";
import ApprovalReview from "./pages/ApprovalReview";
import Activity from "./pages/Activity";
import RequireAdmin from "./components/auth/RequireAdmin";
import RequireProductManager from "./components/auth/RequireProductManager";
import RequireCan from "./components/auth/RequireCan";
import RequireAuth from "./components/auth/RequireAuth";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import { TourProvider } from "./components/tour/TourContext";
import TourOverlay from "./components/tour/TourOverlay";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <TourProvider>
        <TourOverlay />
        <Routes>
          {/* Dashboard Layout — requires a signed-in user */}
          <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index path="/" element={<Home />} />

            {/* Product */}
            <Route path="/product" element={<Product />} />

            {/* Product create + edit: admins and product managers (own
                products, enforced by RLS). Static /new before :slug. */}
            <Route element={<RequireProductManager />}>
              <Route path="/product/new" element={<ProductNew />} />
              <Route path="/product/:slug/edit" element={<ProductEdit />} />
              <Route path="/product/bulk-prices" element={<BulkPrices />} />
            </Route>

            {/* Permission-gated management pages. */}
            <Route element={<RequireCan resource="media" action="view" />}>
              <Route path="/media" element={<Media />} />
            </Route>
            <Route element={<RequireCan resource="category" action="view" />}>
              <Route path="/product/categories" element={<Categories />} />
            </Route>
            <Route element={<RequireCan resource="company" action="view" />}>
              <Route path="/product/companies" element={<Companies />} />
            </Route>
            {/* Company detail: any signed-in user may open it. RLS returns only
                companies they belong to (else the page shows "not found"), and
                brand actions inside are gated by ownership + brand permission. */}
            <Route
              path="/product/companies/:slug"
              element={<CompanyDetail />}
            />
            {/* Resolves & redirects to the signed-in user's own company. */}
            <Route path="/my-company" element={<MyCompany />} />
            <Route element={<RequireCan resource="users" action="view" />}>
              <Route path="/users" element={<Users />} />
            </Route>

            {/* Admin-only: attributes and activity. */}
            <Route element={<RequireAdmin />}>
              <Route path="/product/attributes" element={<Attributes />} />
              <Route path="/activity" element={<Activity />} />
            </Route>

            {/* Roles & permissions: admins and staff with the role permission. */}
            <Route element={<RequireCan resource="role" action="view" />}>
              <Route path="/roles" element={<Roles />} />
            </Route>

            {/* Approvals: admins and staff with the approval permission. */}
            <Route element={<RequireCan resource="approval" action="approve" />}>
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/approvals/:slug" element={<ApprovalReview />} />
            </Route>

            <Route path="/product/:slug" element={<ProductDetail />} />

            {/* Others Page */}
            <Route path="/profile" element={<UserProfiles />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/blank" element={<Blank />} />

            {/* Forms */}
            <Route path="/form-elements" element={<FormElements />} />

            {/* Tables */}
            <Route path="/basic-tables" element={<BasicTables />} />

            {/* Ui Elements */}
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/avatars" element={<Avatars />} />
            <Route path="/badge" element={<Badges />} />
            <Route path="/buttons" element={<Buttons />} />
            <Route path="/images" element={<Images />} />
            <Route path="/videos" element={<Videos />} />

            {/* Charts */}
            <Route path="/line-chart" element={<LineChart />} />
            <Route path="/bar-chart" element={<BarChart />} />
          </Route>
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          {/* Invited users land here from the email link to set a password. */}
          <Route path="/set-password" element={<SetPassword />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TourProvider>
      </Router>
    </>
  );
}
