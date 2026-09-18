import { supabase } from "./supabase";

export type AppNotification = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** The current user's recent notifications (own rows only, via RLS). */
export async function loadNotifications(limit = 20): Promise<{
  items: AppNotification[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, kind, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { items: [], error: error.message };
  return { items: (data as AppNotification[]) ?? [], error: null };
}

/** Mark one notification read. */
export async function markNotificationRead(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

/** Mark all of the current user's unread notifications read. */
export async function markAllNotificationsRead(): Promise<{
  error: string | null;
}> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return { error: error?.message ?? null };
}
