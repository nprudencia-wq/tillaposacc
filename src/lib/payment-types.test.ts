import { describe, expect, it, beforeEach } from "vitest";
import { methodLabel, isCashMethod, activeTypes, setPaymentTypeCache, type PaymentType } from "./payment-types";

const types: PaymentType[] = [
  { id: "1", code: "cash", name: "Cash", is_cash: true, active: true, sort_order: 1 },
  { id: "2", code: "ecocash", name: "EcoCash", is_cash: false, active: true, sort_order: 2 },
  { id: "3", code: "cheque", name: "Cheque", is_cash: false, active: false, sort_order: 3 },
];

beforeEach(() => setPaymentTypeCache(types));

describe("payment types", () => {
  it("uses the shop's own name for a configured type", () => expect(methodLabel("ecocash")).toBe("EcoCash"));
  it("still reads a legacy code that is no longer on the list", () => expect(methodLabel("mobile_money")).toBe("Mobile money"));
  it("shows the raw code when nothing matches", () => expect(methodLabel("unknown_x")).toBe("unknown_x"));
  it("counts drawer cash by the flag, not the name", () => {
    expect(isCashMethod("cash")).toBe(true);
    expect(isCashMethod("ecocash")).toBe(false);
  });
  it("treats an unlisted code as cash only when it is literally cash", () => {
    expect(isCashMethod("cheque")).toBe(false);
    expect(isCashMethod("cash")).toBe(true);
  });
  it("offers only switched-on types", () => expect(activeTypes(types).map((t) => t.code)).toEqual(["cash", "ecocash"]));
  it("still offers the built-in four if the list is empty", () => expect(activeTypes([]).length).toBe(4));
});
