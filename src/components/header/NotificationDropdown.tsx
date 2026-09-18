import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../lib/notifications";

/** "5 min ago" style relative time. */
function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

const dotColor = (kind: string) =>
  kind === "product_approved"
    ? "bg-success-500"
    : kind === "product_rejected"
    ? "bg-error-500"
    : kind === "product_pending"
    ? "bg-warning-500"
    : "bg-brand-500";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { items } = await loadNotifications();
    setItems(items);
  }, []);

  useEffect(() => {
    load();
    // Light polling so approvals show up without a page refresh.
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const openDropdown = async () => {
    setIsOpen(true);
    await load();
  };

  const handleMarkAll = async () => {
    if (unread === 0) return;
    await markAllNotificationsRead();
    setItems((list) =>
      list.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
  };

  const handleClickItem = async (n: AppNotification) => {
    setIsOpen(false);
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setItems((list) =>
        list.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
    }
  };

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
      >
        {unread > 0 && (
          <span className="absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 flex">
            <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex max-h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Notifications
          </h5>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-theme-xs font-medium text-brand-500 hover:text-brand-600"
            >
              Mark all read
            </button>
          )}
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-sm text-center text-gray-500 dark:text-gray-400">
              No notifications yet.
            </li>
          ) : (
            items.map((n) => {
              const inner = (
                <span className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read_at ? "bg-transparent" : dotColor(n.kind)
                    }`}
                  />
                  <span className="block">
                    <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-theme-sm text-gray-500 dark:text-gray-400">
                        {n.body}
                      </span>
                    )}
                    <span className="block mt-1 text-gray-400 text-theme-xs">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                </span>
              );
              const cls = `block rounded-lg border-b border-gray-100 px-3 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5 ${
                n.read_at ? "" : "bg-gray-50 dark:bg-white/[0.03]"
              }`;
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => handleClickItem(n)}
                      className={cls}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={`w-full text-left ${cls}`}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </Dropdown>
    </div>
  );
}
