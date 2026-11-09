const SHOP_KEY = "tilla-shop-label";

/** Name each till "Till 1", "Till 2"… up to the shop's till count (at least one). */
export function tillNames(count: number): string[] {
  const n = Math.max(1, Math.min(50, Math.floor(count || 1)));
  return Array.from({ length: n }, (_, i) => `Till ${i + 1}`);
}

/** Link a till device opens once to set its fixed name and shop label. */
export function pairingLink(origin: string, shop: string, till: string) {
  const q = new URLSearchParams({ shop: shop.trim().slice(0, 60), till: till.trim().slice(0, 40) });
  return `${origin}/till?${q.toString()}`;
}

export function cleanLabel(v: unknown, max: number) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "";
}

export function getShopLabel(): string {
  try { return localStorage.getItem(SHOP_KEY) || ""; } catch { return ""; }
}
export function setShopLabel(name: string) {
  try { localStorage.setItem(SHOP_KEY, cleanLabel(name, 60)); } catch { /* ignore */ }
}
