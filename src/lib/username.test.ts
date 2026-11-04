import { describe, expect, it } from "vitest";
import { effectivePermission, isValidUsername, loginEmail } from "./username";

describe("username logins", () => {
  it("maps a username to its private login address", () => {
    expect(loginEmail(" Tendai ")).toBe("tendai@staff.tilla.local");
  });
  it("keeps real emails for older accounts", () => {
    expect(loginEmail("Owner@Shop.co.zw")).toBe("owner@shop.co.zw");
  });
  it("rejects usernames with spaces", () => {
    expect(isValidUsername("ten dai")).toBe(false);
  });
});

describe("access rights", () => {
  it("cashier cannot refund by default", () => {
    expect(effectivePermission(["cashier"], "refund", {})).toBe(false);
  });
  it("a personal Allow overrides the role", () => {
    expect(effectivePermission(["cashier"], "refund", { refund: true })).toBe(true);
  });
  it("a personal Block overrides the role", () => {
    expect(effectivePermission(["cashier"], "give_discount", { give_discount: false })).toBe(false);
  });
});

describe("price override right", () => {
  it("is on by default for supervisors, off for cashiers", () => {
    expect(effectivePermission(["supervisor"], "override_price", {})).toBe(true);
    expect(effectivePermission(["cashier"], "override_price", {})).toBe(false);
  });
  it("can be allowed for one cashier on the Staff page", () => {
    expect(effectivePermission(["cashier"], "override_price", { override_price: true })).toBe(true);
  });
});
