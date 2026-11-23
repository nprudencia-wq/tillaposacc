import { describe, expect, it } from "vitest";
import { HEARTBEAT_INTERVAL_MS, REGISTER_IDS, SYNC_INTERVAL_MS, isRegisterId } from "./register";
import { redactError } from "./register-events";
describe("five-register setup", () => {
  it("allows only REG-01 to REG-05", () => { expect(REGISTER_IDS).toEqual(["REG-01", "REG-02", "REG-03", "REG-04", "REG-05"]); expect(isRegisterId("REG-06")).toBe(false); });
  it("syncs every 5 seconds and sends heartbeat every 5 minutes", () => { expect(SYNC_INTERVAL_MS).toBe(5000); expect(HEARTBEAT_INTERVAL_MS).toBe(300000); });
  it("removes credentials from error reports", () => { expect(redactError("Bearer abc.def https://x.test/a")).toBe("Bearer [redacted] [address]"); });
});
