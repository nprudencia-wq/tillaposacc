import { describe, expect, it } from "vitest";
import { effectivePermission, isValidPin, isValidUsername, loginEmail } from "./username";

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
  it("cashiers require an explicit Allow to discount", () => {
    expect(effectivePermission(["cashier"], "give_discount", {})).toBe(false);
    expect(effectivePermission(["cashier"], "give_discount", { give_discount: true })).toBe(true);
    expect(effectivePermission(["supervisor"], "give_discount", {})).toBe(true);
  });
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

describe("till PINs", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
  });
  it("rejects too short, too long or letters", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
});

import { canOpenReports as _open, canSeeReport as _see } from "./username";
describe("single report access", () => {
  it("cashier with only one report allowed can open Reports and sees just that report", () => {
    const perms = { view_reports: false, report_cashier_items: true } as const;
    expect(_open(perms)).toBe(true);
    expect(_see(perms, "cashier-items")).toBe(true);
    expect(_see(perms, "pl")).toBe(false);
  });
  it("blocked report stays hidden even with full report access", () => {
    expect(_see({ view_reports: true }, "pl", { report_pl: false })).toBe(false);
  });
  it("no report rights means no Reports page", () => {
    expect(_open({ view_reports: false })).toBe(false);
  });
});
