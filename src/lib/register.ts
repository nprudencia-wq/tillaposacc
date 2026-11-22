export const REGISTER_IDS = ["REG-01", "REG-02", "REG-03", "REG-04", "REG-05"] as const;
export type RegisterId = typeof REGISTER_IDS[number];
export const SYNC_INTERVAL_MS = 5_000;
export const HEARTBEAT_INTERVAL_MS = 300_000;
export const APP_VERSION = "2026.11.registers.1";
export type RegisterIdentity = { registerId: RegisterId; deviceId: string };
export function isRegisterId(value: unknown): value is RegisterId {
  return REGISTER_IDS.some((id) => id === value);
}
export function readRegister(storeId: string): RegisterIdentity | null {
  try {
    const value = JSON.parse(localStorage.getItem(`tilla-register:${storeId}`) ?? "null");
    return isRegisterId(value?.registerId) && typeof value?.deviceId === "string" ? value : null;
  } catch { return null; }
}
export function deviceId() {
  const saved = localStorage.getItem("tilla-register-device");
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem("tilla-register-device", id);
  return id;
}
export function saveRegister(storeId: string, identity: RegisterIdentity) {
  if (!isRegisterId(identity.registerId)) throw new Error("Choose REG-01 to REG-05");
  localStorage.setItem(`tilla-register:${storeId}`, JSON.stringify(identity));
  window.dispatchEvent(new Event("tilla-register"));
}