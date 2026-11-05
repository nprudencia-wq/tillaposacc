import { describe, expect, it } from "vitest";
import { connectionLabels, connectionState } from "./connection";

describe("connection light", () => {
  it("is green when online with nothing waiting", () => {
    expect(connectionState({ online: true, syncing: false, pending: 0 })).toBe("online");
  });
  it("is amber while uploads are running", () => {
    expect(connectionState({ online: true, syncing: true, pending: 0 })).toBe("syncing");
  });
  it("is amber when sales are still queued on the device", () => {
    expect(connectionState({ online: true, syncing: false, pending: 2 })).toBe("syncing");
  });
  it("is red when offline even if uploads are running and sales are queued", () => {
    expect(connectionState({ online: false, syncing: true, pending: 3 })).toBe("offline");
  });
  it("names the three lights for the cashier", () => {
    expect(connectionLabels).toEqual({ online: "Online", syncing: "Syncing", offline: "Offline" });
  });
});
