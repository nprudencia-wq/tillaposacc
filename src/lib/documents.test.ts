import { describe, expect, it } from "vitest";
import { creditLines, documentTotals } from "./documents";

describe("sales documents", () => {
  const lines = [{product_id:"a",name:"A",quantity:2,unit_price:5,line_total:10}];
  it("keeps document values in USD and applies the discount once", () => expect(documentTotals(lines,2)).toEqual({subtotal:10,total:8}));
  it("rejects negative quantities", () => expect(() => documentTotals([{product_id:"a",name:"A",quantity:-1,unit_price:5,line_total:-5}],0)).toThrow());
  it("rejects discounts above the document subtotal", () => expect(() => documentTotals(lines,11)).toThrow());
  it("allocates credit lines to the actual refund including the rounding remainder", () => {
    const values=creditLines([1,2,3].map((v)=>({product_id:String(v),name:String(v),quantity:1,unit_price:1,line_total:1})),1);
    expect(values.map((v)=>v.line_total)).toEqual([0.33,0.33,0.34]);
  });
});