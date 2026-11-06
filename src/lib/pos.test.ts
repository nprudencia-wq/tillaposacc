import { describe, expect, it } from "vitest";
import { cartSubtotal, changeDueUSD, resolveDiscount, fromUSD, saleStockError } from "./pos";

const lines = [
  { product_id: "a", name: "A", unit_price: 1.2, quantity: 3, stock: 10 },
  { product_id: "b", name: "B", unit_price: 8.5, quantity: 1, stock: 10 },
];

describe("POS maths", () => {
  it("blocks zero-stock sales", () => expect(saleStockError("Bread", 1, 0)).toBe("Bread: out of stock"));
  it("blocks quantities exceeding available stock", () => expect(saleStockError("Milk", 3, 2)).toBe("Milk: only 2 available"));
  it("allows selling the exact available quantity", () => expect(saleStockError("Milk", 2, 2)).toBeNull());
  it("sums the cart", () => expect(cartSubtotal(lines)).toBe(12.1));
  it("percentage discount", () => expect(resolveDiscount(100, "percent", 10)).toBe(10));
  it("fixed discount capped at subtotal", () => expect(resolveDiscount(5, "fixed", 9)).toBe(5));
  it("converts USD to ZiG at the rate", () => expect(fromUSD(10, "ZiG", 26.8)).toBe(268));
  it("change on split USD + ZiG payment", () => {
    const change = changeDueUSD(12, [
      { method: "cash", currency: "USD", amount: 10 },
      { method: "mobile_money", currency: "ZiG", amount: 80.4 },
    ], 26.8);
    expect(change).toBe(1);
  });
  it("shows amount still owed as negative", () =>
    expect(changeDueUSD(12, [{ method: "cash", currency: "USD", amount: 5 }], 26.8)).toBe(-7));
});
