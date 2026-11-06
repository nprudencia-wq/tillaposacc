import { describe, expect, it } from "vitest";
import { belongsToScope, scopedStorageKey } from "./store-scope";

describe("store device isolation", () => {
  it("keeps different stores' cached records separate", () => {
    expect(scopedStorageKey("products", { storeId: "a", userId: "u" })).not.toBe(scopedStorageKey("products", { storeId: "b", userId: "u" }));
  });
  it("keeps staff queues separate within a store", () => {
    expect(scopedStorageKey("sales", { storeId: "a", userId: "u" })).not.toBe(scopedStorageKey("sales", { storeId: "a", userId: "v" }));
  });
  it("rejects replay by another store or cashier", () => {
    const sale = { store_id: "a", user_id: "u" };
    expect(belongsToScope(sale, { storeId: "a", userId: "u" })).toBe(true);
    expect(belongsToScope(sale, { storeId: "b", userId: "u" })).toBe(false);
    expect(belongsToScope(sale, { storeId: "a", userId: "v" })).toBe(false);
    expect(belongsToScope({}, { storeId: "a", userId: "u" })).toBe(false);
  });
});