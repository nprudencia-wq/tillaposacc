import { describe, expect, it } from "vitest";
import { effectivePermission } from "./username";

describe("module access", () => {
  it("cashier cannot open accounting by default", () => expect(effectivePermission(["cashier"], "module_accounting", {})).toBe(false));
  it("stock controller opens inventory by default", () => expect(effectivePermission(["stock_controller"], "module_inventory", {})).toBe(true));
  it("personal block overrides role", () => expect(effectivePermission(["manager"], "module_accounting", { module_accounting: false })).toBe(false));
  it("personal allow overrides role", () => expect(effectivePermission(["cashier"], "module_customers", { module_customers: true })).toBe(true));
});
