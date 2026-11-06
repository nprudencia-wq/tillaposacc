import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function authStorageKey(): string {
  return (supabase.auth as unknown as { storageKey: string }).storageKey;
}

/** The signed-in session; with no internet, the one saved on this device even if it needs refreshing. */
export async function deviceSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session || navigator.onLine) return data.session;
  try {
    const raw = localStorage.getItem(authStorageKey());
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.user?.id ? s : null;
  } catch { return null; }
}
