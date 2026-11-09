import { describe, expect, it } from "vitest";
import { SHOP_UPDATE_TABLES, shopUpdateFilter, isSharedShopQuery } from "./shop-updates";

describe("shared till and Back Office updates", () => {
  it("covers sales, inventory, supplier deliveries, receipts, credit, shifts and staff rights", () => {
    for (const table of ["sales", "products", "grns", "suppliers", "settings", "customer_payments", "cashier_shifts", "user_permissions"]) {
      expect(SHOP_UPDATE_TABLES).toContain(table);
    }
  });
  it("limits every subscription to the signed-in store", () => {
    expect(shopUpdateFilter("stores", "shop-a")).toBe("id=eq.shop-a");
    for (const table of SHOP_UPDATE_TABLES.filter((t) => t !== "stores")) expect(shopUpdateFilter(table, "shop-a")).toBe("store_id=eq.shop-a");
  });
  it("refreshes shared records but not immutable image downloads", () => {
    expect(isSharedShopQuery(["settings"])).toBe(true);
    expect(isSharedShopQuery(["products", "active"])).toBe(true);
    expect(isSharedShopQuery(["receipt-logo", "shop/logo.png"])).toBe(false);
  });
  it("does not listen to secret staff or fiscal credentials", () => {
    expect(SHOP_UPDATE_TABLES).not.toContain("staff_pins");
    expect(SHOP_UPDATE_TABLES).not.toContain("zimra_secrets");
  });
});