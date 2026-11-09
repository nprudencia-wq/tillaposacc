import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Exercise the existing handlers, with shop writes mocked so tests cannot sell live stock.
const source = readFileSync("src/routes/_authenticated/pos.tsx", "utf8");
const ast = ts.createSourceFile("pos.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, dependencies: Record<string, unknown>) {
  let text = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!text) throw new Error(`Missing handler ${name}`);
  const js = ts.transpile(text, { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(dependencies), `${js}; return ${name};`)(...Object.values(dependencies));
}

function setup(error: unknown = null) {
  const track = vi.fn();
  const enqueueSale = vi.fn();
  const saveOffline = vi.fn();
  const finish = vi.fn();
  const dependencies = {
    window: { __lovableEvents: { track }, dispatchEvent: vi.fn() }, Event: class {}, creditSnapshot: async () => undefined, customerOwed: async () => 0, creditLimitError: () => null, navigator: { onLine: true },
    crypto: { randomUUID: () => "test-reference" },
    supabase: { rpc: vi.fn().mockResolvedValue({ data: { sale_number: "test", total: 2, change: 0, rate: 1 }, error }) },
    randEnabled: false, currency: "USD", rate: 1, randRate: 0, shiftId: "shift",
    saleRef: { current: null }, settings: { business_name: "Shop" }, me: { name: "Cashier" }, subtotal: 2,
    internetAvailable: () => true, setInternetAvailable: vi.fn(), readLocalShift: async () => null,
    networkRead: async (run: () => Promise<unknown>) => run(),
    lines: [{ product_id: "product", quantity: 1, unit_price: 2 }],
    products: [{ id: "product", stock: 5 }], discount: 0, total: 2, customer: undefined,
    saleStockError: () => null, currencyRate: () => 1, listPrice: () => 2,
    isAccountMethod: () => false, isCashMethod: () => true, isNetworkError: () => false,
    qc: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
    toast: { error: vi.fn(), success: vi.fn() }, finish, enqueueSale, saveOffline, paidUSD: () => 2,
  };
  return { dependencies, track, enqueueSale, saveOffline, finish };
}
const payment = [{ method: "cash", currency: "USD", amount: 2 }];

describe("Till completion tracking", () => {
  it("records one event after the online sale succeeds", async () => {
    const { dependencies, track, finish } = setup();
    await handler("complete", dependencies)(payment);
    expect(finish).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledExactlyOnceWith("project.till_sale_completed", { mode: "online", currency: "USD" });
  });
  it("does not count a rejected sale", async () => {
    const { dependencies, track, finish } = setup({ message: "Insufficient stock" });
    await handler("complete", dependencies)(payment);
    expect(finish).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
  it("records offline completion only after the queue save succeeds", async () => {
    const { dependencies, track, enqueueSale } = setup();
    await handler("saveOffline", dependencies)(payment);
    expect(enqueueSale).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledExactlyOnceWith("project.till_sale_completed", { mode: "offline", currency: "USD" });
    const savedAt = enqueueSale.mock.invocationCallOrder[0];
    const trackedAt = track.mock.invocationCallOrder[0];
    if (savedAt === undefined || trackedAt === undefined) throw new Error("Missing save or tracking call");
    expect(savedAt).toBeLessThan(trackedAt);
  });
  it("does not count an offline sale when storing it fails", async () => {
    const { dependencies, track, enqueueSale } = setup();
    enqueueSale.mockImplementation(() => { throw new Error("Storage full"); });
    await expect(handler("saveOffline", dependencies)(payment)).rejects.toThrow("Storage full");
    expect(track).not.toHaveBeenCalled();
  });
  it("reuses the online reference when a response is lost", async () => {
    const { dependencies, saveOffline } = setup({ message: "Failed to fetch" });
    dependencies.isNetworkError = () => true;
    await handler("complete", dependencies)(payment);
    expect(saveOffline).toHaveBeenCalledWith(expect.any(Array), "TILL-test-reference");
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith("complete_sale_once", expect.objectContaining({ p_client_ref: "TILL-test-reference" }));
  });
  it("keeps checkout working when tracking is unavailable", async () => {
    const { dependencies, finish } = setup();
    dependencies.window = {} as typeof dependencies.window;
    await handler("complete", dependencies)(payment);
    expect(finish).toHaveBeenCalledOnce();
  });
});