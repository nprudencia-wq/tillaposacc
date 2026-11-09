import { describe, expect, it } from "vitest";
import { cleanLabel, pairingLink, tillNames } from "./till-pairing";

describe("till pairing", () => {
  it("names one till per paid till", () => {
    expect(tillNames(2)).toEqual(["Till 1", "Till 2"]);
    expect(tillNames(0)).toEqual(["Till 1"]);
  });
  it("builds a till sign-in link with shop and till name", () => {
    expect(pairingLink("https://tillapos.com", "Mai Rudo Store", "Till 2"))
      .toBe("https://tillapos.com/till?shop=Mai+Rudo+Store&till=Till+2");
  });
  it("strips markup from labels", () => {
    expect(cleanLabel("<b>Shop</b>", 60)).toBe("bShop/b");
  });
});
