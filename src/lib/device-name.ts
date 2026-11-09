const KEY = "tilla-device-name";

/** Fixed name of this physical till (e.g. "Counter 1"); kept on the device, not the cashier. */
export function getDeviceName(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setDeviceName(name: string) {
  try { localStorage.setItem(KEY, name.trim().slice(0, 40)); } catch { /* ignore */ }
}
