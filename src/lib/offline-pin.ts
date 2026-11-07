// Offline till PIN sign-in. After a cashier signs in with their PIN online, this device keeps a
// slow salted hash of the PIN (never the PIN itself) and their sign-in, so they can unlock the
// till again here when there is no internet. Only staff who signed in on this device can use it.
import { idbGet, idbSet } from "@/lib/local-db";

const KEY = "tilla-offline-pins";
const ITERATIONS = 150_000;
export const MAX_TRIES = 5;
export const LOCK_MS = 5 * 60_000;

type Entry = { username: string; aliases?: string[]; userId: string; salt: string; hash: string; session: string; tries: number; lockedUntil: number };

const norm = (u: string) => u.trim().toLowerCase();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return b64(bits);
}

async function all(): Promise<Entry[]> { return (await idbGet<Entry[]>(KEY).catch(() => undefined)) ?? []; }
async function save(list: Entry[]) { await idbSet(KEY, list); }

/** Call after a successful online PIN sign-in. */
export async function rememberPin(username: string, pin: string, userId: string, session: unknown, aliases: string[] = []) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const entry: Entry = { username: norm(username), aliases: aliases.map(norm).filter(Boolean), userId, salt: b64(salt), hash: await hashPin(pin, salt), session: JSON.stringify(session), tries: 0, lockedUntil: 0 };
  const list = (await all()).filter((e) => e.username !== entry.username && e.userId !== userId);
  await save([...list, entry]);
}

/** Keep the saved sign-in fresh as the till renews it, so it still works when offline later. */
export async function refreshSavedSession(userId: string, session: unknown) {
  const list = await all();
  const e = list.find((x) => x.userId === userId);
  if (!e) return;
  e.session = JSON.stringify(session);
  await save(list);
}

export async function forgetPinsFor(userId: string) {
  await save((await all()).filter((e) => e.userId !== userId));
}

export type OfflineResult = { ok: true; session: string } | { ok: false; reason: string };

/** Check a PIN against this device's saved copy. 5 wrong tries lock that user here for 5 minutes. */
export async function checkOfflinePin(username: string, pin: string, now = Date.now()): Promise<OfflineResult> {
  const list = await all();
  const matches = list.filter((x) => x.username === norm(username) || x.aliases?.includes(norm(username)));
  if (matches.length > 1) return { ok: false, reason: "More than one cashier uses this name. Enter your unique username or email." };
  const e = matches[0];
  if (!e) return { ok: false, reason: "This person hasn't signed in on this till before. Connect to the internet for their first sign-in." };
  if (e.lockedUntil > now) return { ok: false, reason: "Too many wrong PINs. Try again in 5 minutes." };
  const good = (await hashPin(pin, unb64(e.salt))) === e.hash;
  if (good) { e.tries = 0; e.lockedUntil = 0; }
  else { e.tries += 1; if (e.tries >= MAX_TRIES) { e.tries = 0; e.lockedUntil = now + LOCK_MS; } }
  await save(list);
  return good ? { ok: true, session: e.session } : { ok: false, reason: "Wrong username or PIN" };
}
