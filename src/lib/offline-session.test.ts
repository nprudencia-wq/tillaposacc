import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const auth = vi.hoisted(() => ({ storageKey: "cloud-session", getUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { rememberDeviceSession, clearDeviceSession, restoreDeviceSession, savedSession, hasDeviceLogin } from "./offline-session";
import { setInternetAvailable } from "./connectivity";
const session = { user: { id: "cashier-1" }, access_token: "test-only" } as Session;
beforeEach(() => { localStorage.clear(); setInternetAvailable(true); auth.getUser.mockReset(); });
describe("active offline device session", () => {
  it("survives loss of cloud storage during a failed refresh", async () => {
    rememberDeviceSession(session);
    localStorage.removeItem("cloud-session");
    auth.getUser.mockRejectedValue(new Error("Failed to fetch"));
    expect(await hasDeviceLogin()).toBe(true);
    expect(savedSession()?.user.id).toBe("cashier-1");
  });
  it("explicit sign-out removes active access but does not recreate it", async () => {
    restoreDeviceSession(JSON.stringify(session));
    clearDeviceSession();
    expect(savedSession()).toBeNull();
    expect(await hasDeviceLogin()).toBe(false);
  });
  it("restores the PIN-verified cashier before cloud hydration", async () => {
    restoreDeviceSession(JSON.stringify(session));
    setInternetAvailable(false);
    expect(await hasDeviceLogin()).toBe(true);
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});