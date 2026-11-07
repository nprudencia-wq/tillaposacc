import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { internetAvailable, setInternetAvailable } from "@/lib/connectivity";
import { isNetworkError } from "@/lib/offline";

export function authStorageKey(): string {
  return (supabase.auth as unknown as { storageKey: string }).storageKey;
}

/** The signed-in session; with no internet, the one saved on this device even if it needs refreshing. */
export function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(authStorageKey());
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.user?.id ? s : null;
  } catch { return null; }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** The signed-in session; when the internet is down or slow (even with Wi-Fi on), the one saved on this device. */
export async function deviceSession(): Promise<Session | null> {
  if (!internetAvailable()) return savedSession();
  const res = await withTimeout(supabase.auth.getSession(), 4000);
  return res?.data.session ?? savedSession();
}

/** Route guard check: verify online when reachable, otherwise trust this device's saved sign-in. */
export async function hasDeviceLogin(): Promise<boolean> {
  const saved = savedSession();
  if (!saved) return false;
  if (navigator.onLine && internetAvailable()) {
    const res = await withTimeout(supabase.auth.getUser(), 5000);
    if (res?.data.user) return true;
    // Only a definite "signed out" answer from the server ends the session.
    const status = (res?.error as { status?: number } | undefined)?.status;
    if (res?.error && !isNetworkError(res.error) && (status === 401 || status === 403)) return false;
    setInternetAvailable(false);
  }
  return true;
}
