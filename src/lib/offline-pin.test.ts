import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/local-db", () => ({
  idbGet: async (k: string) => store.get(k),
  idbSet: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); },
}));

import { checkOfflinePin, rememberPin, LOCK_MS } from "./offline-pin";

describe("offline till PIN", () => {
  beforeEach(() => store.clear());

  it("unlocks with the right PIN for someone who signed in here before", async () => {
    await rememberPin("Tendai", "1234", "u1", { user: { id: "u1" } });
    const r = await checkOfflinePin("tendai", "1234");
    expect(r.ok).toBe(true);
  });

  it("refuses a wrong PIN and never stores the PIN itself", async () => {
    await rememberPin("tendai", "1234", "u1", {});
    expect(JSON.stringify([...store.values()])).not.toContain("1234");
    expect((await checkOfflinePin("tendai", "9999")).ok).toBe(false);
  });

  it("refuses someone who has never signed in on this device", async () => {
    expect((await checkOfflinePin("stranger", "1234")).ok).toBe(false);
  });

  it("locks for 5 minutes after 5 wrong tries, even with the right PIN", async () => {
    await rememberPin("tendai", "1234", "u1", {});
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) await checkOfflinePin("tendai", "0000", t);
    expect((await checkOfflinePin("tendai", "1234", t + 1000)).ok).toBe(false);
    expect((await checkOfflinePin("tendai", "1234", t + LOCK_MS + 1)).ok).toBe(true);
  });
});
