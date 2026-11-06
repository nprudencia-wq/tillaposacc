import { describe, expect, it } from "vitest";
import { summarizeItemsSold } from "./items-sold";

describe("summarizeItemsSold", () => {
  it("nets refunded units off units sold per product", () => {
    const r = summarizeItemsSold([
      { product_id: "a", name: "Bread", quantity: 3, refunded_qty: 1, line_total: 3 },
      { product_id: "a", name: "Bread", quantity: 2, refunded_qty: 0, line_total: 2 },
      { product_id: "b", name: "Milk", quantity: 1, refunded_qty: 0, line_total: 1.5 },
    ]);
    expect(r[0]!).toEqual({ name: "Bread", sold: 5, refunded: 1, net: 4, total: 5 });
    expect(r[1]?.net).toBe(1);
  });
});
