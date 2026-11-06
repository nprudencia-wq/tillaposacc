import { describe, it, expect } from "vitest";
import { mergeQueues } from "./queue-merge";

describe("mergeQueues", () => {
  it("never duplicates a queued sale with the same reference", () => {
    const r = mergeQueues([{ client_ref: "a", n: 1 }], [{ client_ref: "a", n: 2 }, { client_ref: "b", n: 3 }]);
    expect(r).toEqual([{ client_ref: "a", n: 2 }, { client_ref: "b", n: 3 }]);
  });
});
