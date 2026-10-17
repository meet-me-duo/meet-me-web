import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

// Independent oracle: PS09/14/15/18 and the agreed public pre-submit contract.
// These transport tests use synthetic JSON; they do not evaluate an AI model.
const identity = vi.hoisted(() => ({ token: "synthetic-check-access" as string | null, epoch: 1 }));
vi.mock("../auth/session", () => ({ getAccessToken: () => identity.token, getSessionVersion: () => identity.epoch }));
const code = "abcdefghijklmnopqrstuv";
const checkId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const start = { request_id: requestId, expected_revision: 0, raw_text: "주말 아무 때나 가능" };
const command = { request_id: requestId, expected_revision: 1, expected_check_version: 2 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function response(body: unknown = {}, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
beforeEach(() => { identity.token = "synthetic-check-access"; identity.epoch = 1; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

const actions = [
  ["start", "", () => api.startSubmissionCheck(code, start), start],
  ["answer", `/${checkId}/answer`, () => api.answerSubmissionCheck(code, checkId, { ...command, question_id: "33333333-3333-4333-8333-333333333333", choice_id: "A" }), { ...command, question_id: "33333333-3333-4333-8333-333333333333", choice_id: "A" }],
  ["retry", `/${checkId}/retry`, () => api.retrySubmissionCheck(code, checkId, command), command],
  ["cancel", `/${checkId}/cancel`, () => api.cancelSubmissionCheck(code, checkId, command), command],
] as const;

describe("#107 pre-submit private HTTP boundary", () => {
  it.each(actions)("posts %s once with explicit idempotency/CAS fields and no participant credential", async (_name, suffix, invoke, body) => {
    const fetch = vi.fn().mockResolvedValue(response({}, 202)); vi.stubGlobal("fetch", fetch);
    await invoke();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/rooms/${code}/submission/checks${suffix}`);
    expect(init.method).toBe("POST"); expect(init.credentials).toBe("include"); expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-check-access");
    expect(url + String(init.body)).not.toContain("synthetic-check-access");
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("GET current is a private read with abort support and never starts a check", async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController(); await api.getSubmissionCheck(code, controller.signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/rooms/${code}/submission/checks/current`);
    expect(init.method ?? "GET").toBe("GET"); expect(init.signal).toBe(controller.signal); expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store"); expect(init.credentials).toBe("include");
  });

  it.each([401, 403, 409, 503])("never retries or falls back to guest/legacy save after HTTP %s", async status => {
    const fetch = vi.fn().mockResolvedValue(response({ code: "SYNTHETIC_REJECTION" }, status)); vi.stubGlobal("fetch", fetch);
    await expect(api.startSubmissionCheck(code, start)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers).get("Authorization")).toBe("Bearer synthetic-check-access");
  });

  it.each(actions)("rejects late %s success after account change", async (_name, _suffix, invoke) => {
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const rejected = expect(invoke()).rejects.toMatchObject({ problem: { code: "AUTH_CONTEXT_CHANGED" } });
    identity.epoch++; identity.token = null;
    pending.resolve(response({ candidate: { raw_text: "old account private raw" } }, 202)); await rejected;
  });

  it.each([true, false])("checks account epoch again after delayed JSON decoding (ok=%s)", async ok => {
    const body = deferred<unknown>(); const decoding = deferred<void>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 401, headers: new Headers(), json: () => { decoding.resolve(); return body.promise; } }));
    const outcome = api.getSubmissionCheck(code).then(() => null, error => error as ApiError);
    await decoding.promise; identity.epoch++;
    body.resolve(ok ? { candidate: { raw_text: "previous owner raw" } } : { detail: "previous owner problem" });
    const error = await outcome;
    expect(error).toBeInstanceOf(ApiError); expect(error?.problem.code).toBe("AUTH_CONTEXT_CHANGED");
    expect(error?.message).not.toContain("previous owner");
  });

  it("replays exactly the same request ID and payload only when explicitly requested", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("response lost")).mockResolvedValueOnce(response({}, 202)); vi.stubGlobal("fetch", fetch);
    await expect(api.startSubmissionCheck(code, start)).rejects.toThrow("response lost");
    expect(fetch).toHaveBeenCalledTimes(1);
    await api.startSubmissionCheck(code, start);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[0]?.[1] as RequestInit).body).toBe((fetch.mock.calls[1]?.[1] as RequestInit).body);
  });
});
