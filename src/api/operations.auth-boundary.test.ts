import { afterEach, describe, expect, it, vi } from "vitest";
import { createOperationsApi, operationsMessage, OperationsError } from "./operations";

const tokenA = "isolated-test-access-token-A";
const tokenB = "isolated-test-access-token-B";
const reply = () => new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("optional verified-access token supplier boundary", () => {
  it.each([null, undefined, ""])("omits Authorization for absent token %s without inventing an identity", async token => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetcher);
    await createOperationsApi(() => token).rooms();
    const [url, options] = fetcher.mock.calls[0]!;
    const headers = new Headers(options?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-User-Id")).toBe(false); expect(headers.has("X-Operator-Id")).toBe(false);
    expect(String(url)).not.toMatch(/account|operator_id|role|token/);
  });
  it("reads the current token per request, sends it only in Bearer, and never persists or logs it", async () => {
    let token: string | null = tokenA;
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const log = vi.spyOn(console, "log"); const warn = vi.spyOn(console, "warn"); const error = vi.spyOn(console, "error");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply()); vi.stubGlobal("fetch", fetcher);
    const api = createOperationsApi(() => token);
    await api.rooms(); token = tokenB; await api.rooms(); token = null; await api.rooms();
    const expected = [`Bearer ${tokenA}`, `Bearer ${tokenB}`, null];
    for (const [index, [url, options]] of fetcher.mock.calls.entries()) {
      expect(new Headers(options?.headers).get("Authorization")).toBe(expected[index]);
      expect(String(url)).not.toContain(tokenA); expect(String(url)).not.toContain(tokenB);
      expect(options?.body).toBeUndefined(); expect(options?.credentials).toBe("include");
    }
    expect(storage).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("fails closed without a fetch when the supplier throws, using a sanitized error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetcher);
    let failure: unknown;
    try { await createOperationsApi(() => { throw new Error(tokenA); }).rooms(); } catch (caught) { failure = caught; }
    expect(failure).toBeInstanceOf(OperationsError);
    expect(operationsMessage(failure)).not.toContain(tokenA); expect(String(failure)).not.toContain(tokenA);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not issue a request that was already cancelled", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(createOperationsApi(() => tokenA).rooms(undefined, controller.signal)).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["switch", "logout", "abort"] as const)("rejects a late protected response after %s without guest fallback", async action => {
    let token: string | null = tokenA;
    let complete!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { complete = resolve; })); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const request = createOperationsApi(() => token).rooms(undefined, controller.signal);
    const outcome = request.then(value => ({ ok: true, value }), failure => ({ ok: false, failure }));
    if (action === "abort") controller.abort(); else token = action === "logout" ? null : tokenB;
    complete(reply());
    expect((await outcome).ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not refresh or retry as a guest on an authentication rejection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("PRIVATE_UPSTREAM", { status: 401 })); vi.stubGlobal("fetch", fetcher);
    await expect(createOperationsApi(() => tokenA).rooms()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${tokenA}`);
  });
});
