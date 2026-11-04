import { describe, it, expect } from "vitest";
import { catOptions, reorderQty } from "./categories";

describe("reorderQty", () => {
  it("fills up to maximum stock when at or below minimum", () => expect(reorderQty(4, 12, 50)).toBe(46));
  it("suggests nothing when above minimum", () => expect(reorderQty(20, 12, 50)).toBe(0));
  it("doubles minimum when no maximum is set", () => expect(reorderQty(2, 10, 0)).toBe(18));
});

describe("catOptions", () => {
  it("lists subcategories under their parent", () => {
    const o = catOptions([{ id: "a", name: "Beverages", parent_id: null }, { id: "b", name: "Soft drinks", parent_id: "a" }]);
    expect(o.map((x) => x.label)).toEqual(["Beverages", "Beverages › Soft drinks"]);
  });
});
