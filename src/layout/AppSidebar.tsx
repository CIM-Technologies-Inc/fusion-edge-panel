import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

// Assume these icons are imported from an icon library
import {
  BoxIcon,
  ChevronDownIcon,
  FolderIcon,
  GridIcon,
  GroupIcon,
  HorizontaLDots,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const dashboardItem: NavItem = {
  icon: <GridIcon />,
  name: "Dashboard",
  path: "/",
};

/** Products as a plain link for non-admins (no attribute management). */
const productItem: NavItem = {
  icon: <BoxIcon />,
  name: "Product",
  path: "/product",
};

/** Admins get Products as a submenu with the global attribute pool under it. */
const productAdminItem: NavItem = {
  icon: <BoxIcon />,
  name: "Product",
  subItems: [
    { name: "All products", path: "/product" },
    { name: "Categories", path: "/product/categories" },
    { name: "Companies", path: "/product/companies" },
    { name: "Attributes", path: "/product/attributes" },
  ],
};

const mediaNavItem: NavItem = {
  icon: <FolderIcon />,
  name: "Media",
  path: "/media",
};

/** Admin-only: review products company-users submitted for publishing. */
const approvalsNavItem: NavItem = {
  icon: <BoxIcon />,
  name: "Approvals",
  path: "/approvals",
};

/** Admin-only: activity log for companies & categories. */
const activityNavItem: NavItem = {
  icon: <GridIcon />,
  name: "Activity",
  path: "/activity",
};

/** Admin-only user & role management. */
const usersNavItem: NavItem = {
  icon: <GroupIcon />,
  name: "Users",
  subItems: [
    { name: "All users", path: "/users" },
    { name: "Roles & permissions", path: "/roles" },
  ],
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { isAdmin, can, companyId } = useAuth();
  const location = useLocation();


  // Admins get the full nav. Everyone else gets items for what their
  // permissions allow.
  let navItems: NavItem[];
  if (isAdmin) {
    navItems = [
      dashboardItem,
      productAdminItem,
      approvalsNavItem,
      mediaNavItem,
      usersNavItem,
      activityNavItem,
    ];
  } else {
    // Build the Product group from the sub-links this user can view.
    const productSub = [
      ...(can("product", "view")
        ? [{ name: "All products", path: "/product" }]
        : []),
      ...(can("category", "view")
        ? [{ name: "Categories", path: "/product/categories" }]
        : []),
      // A company-user assigned to a company always gets a "My company" link
      // (where brands live). It goes through /my-company, which resolves their
      // company by id and redirects — so it works even before the companies
      // list has loaded. A user with company-view but no company of their own
      // gets the full Companies list.
      ...(companyId
        ? [{ name: "My company", path: "/my-company" }]
        : can("company", "view")
        ? [{ name: "Companies", path: "/product/companies" }]
        : []),
    ];

    const productNav: NavItem[] =
      productSub.length === 0
        ? []
        : productSub.length === 1 && productSub[0].path === "/product"
        ? [productItem] // just products → a plain link
        : [{ icon: <BoxIcon />, name: "Product", subItems: productSub }];

    navItems = [
      dashboardItem,
      ...productNav,
      ...(can("approval", "approve") ? [approvalsNavItem] : []),
      ...(can("media", "view") ? [mediaNavItem] : []),
      ...(can("users", "view")
        ? [{ icon: <GroupIcon />, name: "Users", path: "/users" }]
        : []),
    ];
  }

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => location.pathname === path;
  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenSubmenu({ type: "main", index });
            submenuMatched = true;
          }
        });
      }
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                data-tour={
                  nav.path === "/product" ? "nav-product" : undefined
                }
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link to="/">
          {(() => {
            const open = isExpanded || isHovered || isMobileOpen;
            const w = open ? 180 : 50;
            const h = open ? 33 : 11;
            return (
              <>
                {/* Light logo — hidden in dark mode */}
                <img
                  className="dark:hidden"
                  src="/logo.png"
                  alt="FusionEdge"
                  width={w}
                  height={h}
                />
                {/* Dark logo — shown only in dark mode */}
                <img
                  className="hidden dark:block"
                  src="/log-fusion-dark.png"
                  alt="FusionEdge"
                  width={w}
                  height={h}
                />
              </>
            );
          })()}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
