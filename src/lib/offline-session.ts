import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { internetAvailable, setInternetAvailable } from "@/lib/connectivity";
import { isNetworkError } from "@/lib/offline";

const DEVICE_SESSION_KEY = "tilla-active-device-session";

/** A separate device copy survives failed token refresh, but not an explicit sign-out. */
export function rememberDeviceSession(session: Session) {
  localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify(session));
}

export function clearDeviceSession() {
  localStorage.removeItem(DEVICE_SESSION_KEY);
  localStorage.removeItem(authStorageKey());
}

export function restoreDeviceSession(raw: string) {
  const session = JSON.parse(raw) as Session;
  if (!session?.user?.id) throw new Error("Saved sign-in unavailable. Connect and sign in again.");
  rememberDeviceSession(session);
  localStorage.setItem(authStorageKey(), raw);
}

export function authStorageKey(): string {
  return (supabase.auth as unknown as { storageKey: string }).storageKey;
}

/** The signed-in session; with no internet, the one saved on this device even if it needs refreshing. */
export function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(DEVICE_SESSION_KEY) ?? localStorage.getItem(authStorageKey());
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
  if (res?.data.session) rememberDeviceSession(res.data.session);
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
