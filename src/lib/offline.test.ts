import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>(), fail: false, rpc: vi.fn() }));
vi.mock("@/lib/local-db", () => ({
  idbGet: async (k: string) => mocks.storage.get(k),
  idbSet: async (k: string, v: unknown) => { if (mocks.fail) throw new Error("Storage full"); mocks.storage.set(k, structuredClone(v)); },
  idbSetMany: async (entries: [string, unknown][]) => { if (mocks.fail) throw new Error("Storage full"); entries.forEach(([k, v]) => mocks.storage.set(k, structuredClone(v))); },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: null }) }) }) }) } }));
import { cached, enqueueSale, readQueue, setOfflineScope, stockAfterQueue, syncQueue, openLocalShift, closeShiftOffline, readPendingClose, type QueuedSale } from "./offline";
import { setInternetAvailable } from "./connectivity";
const scope = { storeId: "shop", userId: "cashier" };
const sale: QueuedSale = { client_ref: "sale-1", sold_at: "2026-11-07T13:00:00Z", shift_id: "shift", currency: "USD", discount: 0, items: [{ product_id: "bread", quantity: 2 }], payments: [{ method: "cash", currency: "USD", amount: 2 }], total: 2 };
beforeEach(() => { mocks.storage.clear(); mocks.fail = false; mocks.rpc.mockReset(); localStorage.clear(); setOfflineScope(null); });
describe("Durable disconnected sales", () => {
  it("rejects short-paid sales before storing a queue or receipt", async () => {
    setOfflineScope(scope);
    await expect(enqueueSale({ ...sale, payments: [{ method: "cash", currency: "USD", amount: 1.99 }] })).rejects.toThrow("Take full payment");
    expect(readQueue()).toHaveLength(0);
    expect(mocks.storage.size).toBe(0);
  });
  it("rejects negative and non-finite tender amounts", async () => {
    setOfflineScope(scope);
    for (const amount of [-1, NaN, Infinity]) {
      await expect(enqueueSale({ ...sale, payments: [{ method: "cash", currency: "USD", amount }] })).rejects.toThrow("Invalid payment");
    }
    expect(readQueue()).toHaveLength(0);
  });
  it("does not cache a late response after switching cashier", async () => {
    setInternetAvailable(true);
    setOfflineScope(scope);
    await expect(cached("settings", async () => {
      setOfflineScope({ storeId: "other-shop", userId: "other-cashier" });
      return { store_id: "shop" };
    })).rejects.toThrow("Cashier changed");
    expect(mocks.storage.has("tilla-cache:settings:shop:cashier")).toBe(false);
  });
  it("restores queued sales and deducted quantities after reload", async () => {
    setOfflineScope(scope); await enqueueSale(sale);
    setOfflineScope(null); setOfflineScope(scope);
    await enqueueSale({ ...sale, client_ref: "sale-2", items: [{ product_id: "bread", quantity: 1 }] });
    expect(readQueue()).toHaveLength(2);
    expect(stockAfterQueue([{ id: "bread", stock: 5 }])[0]?.stock).toBe(2);
  });
  it("does not accept a sale when durable storage fails", async () => {
    setOfflineScope(scope); await enqueueSale(sale); mocks.fail = true;
    await expect(enqueueSale({ ...sale, client_ref: "lost" })).rejects.toThrow("Storage full");
    expect(readQueue().map((s) => s.client_ref)).toEqual(["sale-1"]);
  });
  it("retries the same reference and never removes a rejected upload", async () => {
    setOfflineScope(scope); await enqueueSale(sale);
    mocks.rpc.mockResolvedValueOnce({ error: { message: "Rejected" } });
    await syncQueue(); expect(readQueue()[0]?.error).toBe("Rejected");
    mocks.rpc.mockResolvedValueOnce({ error: null });
    await syncQueue(); expect(readQueue()).toHaveLength(0);
    expect(mocks.rpc.mock.calls.map((c) => c[1].p_client_ref)).toEqual(["sale-1", "sale-1"]);
  });
  it("uploads an offline shift opening, sales and closing count in that order", async () => {
    setOfflineScope(scope);
    const shift = await openLocalShift({ usd: 10, zig: 0, zar: 20 });
    await enqueueSale({ ...sale, shift_id: shift.id });
    await closeShiftOffline(shift.id, { usd: 12, zig: 0, zar: 20, notes: "Closed without internet" });
    mocks.rpc.mockResolvedValue({ error: null });
    await syncQueue();
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual(["open_offline_shift", "complete_offline_sale", "close_offline_shift"]);
    expect(mocks.rpc.mock.calls[2]?.[1]).toMatchObject({ p_actual_usd: 12, p_actual_zar: 20 });
    expect(await readPendingClose()).toBeNull();
  });
});