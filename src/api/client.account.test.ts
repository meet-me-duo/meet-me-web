import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

const identity = vi.hoisted(() => ({ token: "synthetic-access-a" as string | null, epoch: 1 }));
vi.mock("../auth/session", () => ({
  getAccessToken: () => identity.token,
  getSessionVersion: () => identity.epoch,
}));

const code = "abcdefghijklmnopqrstuv";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function response(body: unknown = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function useFetch() {
  const fetch = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => { identity.token = "synthetic-access-a"; identity.epoch = 1; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("issue #109 authenticated API privacy boundary", () => {
  it.each([
    ["public room GET", () => api.getRoom(code)],
    ["own archive GET", () => api.getAccountRooms()],
    ["explicit claim POST", () => api.claimGuestRoom(code)],
    ["own submission PUT", () => api.saveSubmission(code, { raw_text: "synthetic own input" })],
  ])("attaches current Bearer and cookies to %s", async (_name, call) => {
    const fetch = useFetch();
    await call();
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-access-a");
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain("synthetic-access-a");
    expect(init.body ?? "").not.toContain("synthetic-access-a");
  });

  it("reads the current token for each request and omits Authorization for guests", async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    await api.getRoom(code);
    identity.token = "synthetic-access-b";
    identity.epoch++;
    await api.getRoom(code);
    identity.token = null;
    identity.epoch++;
    await api.getRoom(code);
    expect(fetch.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get("Authorization")))
      .toEqual(["Bearer synthetic-access-a", "Bearer synthetic-access-b", null]);
  });

  it.each([
    ["private GET", () => api.getSubmission(code)],
    ["ownership POST", () => api.claimGuestRoom(code)],
  ])("rejects a late successful %s after an account epoch change", async (_name, call) => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetch);
    const assertion = expect(call()).rejects.toMatchObject({ problem: { code: "AUTH_CONTEXT_CHANGED" } });
    identity.token = "synthetic-access-b";
    identity.epoch++;
    pending.resolve(response({ raw_text: "previous account private input" }));
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an obsolete response when account changes during successful JSON decoding", async () => {
    const body = deferred<unknown>();
    const started = deferred<void>();
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => { started.resolve(); return body.promise; } });
    vi.stubGlobal("fetch", fetch);
    const assertion = expect(api.getSubmission(code)).rejects.toMatchObject({ problem: { code: "AUTH_CONTEXT_CHANGED" } });
    await started.promise;
    identity.token = null;
    identity.epoch++;
    body.resolve({ raw_text: "previous account private input" });
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("replaces a delayed old-account 401 with an auth-context error without exposing its detail", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetch);
    const result = api.getSubmission(code).then(() => null, error => error as ApiError);
    identity.token = "synthetic-access-b";
    identity.epoch++;
    pending.resolve(response({ code: "AUTH_ACCESS_INVALID", detail: "previous account private detail" }, 401));
    const failure = await result;
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure?.problem.code).toBe("AUTH_CONTEXT_CHANGED");
    expect(failure?.message).not.toContain("previous account private detail");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 503])("preserves %s mutation errors without automatic retry or anonymous fallback", async status => {
    const fetch = vi.fn().mockResolvedValue(response({ code: "SYNTHETIC_FAILURE", detail: "synthetic failure" }, status));
    vi.stubGlobal("fetch", fetch);
    await expect(api.claimGuestRoom(code)).rejects.toMatchObject({ status, problem: { code: "SYNTHETIC_FAILURE" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers).get("Authorization")).toBe("Bearer synthetic-access-a");
  });

  it("forwards the supplied AbortSignal and never retries a cancelled read", async () => {
    const controller = new AbortController();
    controller.abort();
    const failure = new DOMException("synthetic cancellation", "AbortError");
    const fetch = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetch);
    await expect(api.getSubmission(code, controller.signal)).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
  });
});
