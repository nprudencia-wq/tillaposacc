// The only place the offline service worker is registered. Never runs in dev, iframes or Lovable previews.
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const LOVABLE_HOSTS = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];

// True inside the Lovable editor preview: an iframe, a preview hostname, or dev mode.
export function isPreviewContext(): boolean {
  if (typeof window === "undefined") return true;
  if (window.self !== window.top) return true;
  const h = window.location.hostname.toLowerCase();
  const label = h.split(".")[0] ?? "";
  if (LOVABLE_HOSTS.some((d) => h.endsWith(d)) && (PREVIEW_LABEL.test(label) || /^project--.+-dev$/.test(label))) return true;
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (h === d || h.endsWith("." + d)) return true;
  }
  return false;
}

function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  if (isPreviewContext()) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()));
}

export async function setupPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) { await unregisterAppSW(); return; }
  // Register directly so the till's offline copy installs on first open (worker uses skipWaiting + clientsClaim for updates).
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    void reg.update().catch(() => undefined);
  } catch (e) {
    console.warn("Offline mode could not be set up", e);
    return;
  }
  // Warm the two visited app entry pages through the generated NetworkFirst worker.
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  }
  const warm = () => Promise.all(["/", "/auth", "/till", "/pos"].map((path) => fetch(path, { credentials: "same-origin" }).catch(() => undefined)));
  await warm();
  // Keep the offline copy fresh after updates so cold launches without internet always open the till.
  window.addEventListener("online", () => { void warm(); });
}
