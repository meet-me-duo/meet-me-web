// Independent #107 x #109 HTTP integration oracle. Token and transport are
// synthetic; expected behavior comes from the published shared auth contract.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

const identity = vi.hoisted(() => ({ token: "synthetic-account-a" as string | null, epoch: 1 }));
vi.mock("../auth/session", () => ({ getAccessToken: () => identity.token, getSessionVersion: () => identity.epoch }));
const code = "abcdefghijklmnopqrstuv";
const question = "11111111-1111-4111-8111-111111111111";
const answer = { request_id: "22222222-2222-4222-8222-222222222222", revision_round_id: "33333333-3333-4333-8333-333333333333", expected_revision: 7, choice: "DIRECT" as const, direct_text: "내일 오후 7~8시, 비대면으로 가능해요" };
const operations = ["GET", "POST"] as const;
function call(operation: typeof operations[number], signal?: AbortSignal) { return operation === "GET" ? api.getClarifications(code, signal) : api.answerClarification(code, question, answer); }
function json(body: unknown = {}, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Retry-After": "3" } }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => { identity.token = "synthetic-account-a"; identity.epoch = 1; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#107 clarification methods use #109's shared account request boundary", () => {
  it.each(operations)("applies current Bearer/cookie/no-store/locale and exact %s contract", async operation => {
    const fetch = vi.fn().mockImplementation(async () => json(operation === "GET" ? { questions: [], state_version: 11 } : { status: "CANCELLED", submission: null })); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController(); const value = await call(operation, controller.signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, raw] = fetch.mock.calls[0]! as [string, RequestInit]; const headers = new Headers(raw.headers);
    expect(raw.credentials).toBe("include"); expect(raw.cache).toBe("no-store");
    expect(headers.get("Authorization")).toBe("Bearer synthetic-account-a"); expect(headers.get("Accept-Language")).toBe("ko-KR");
    expect(url).toMatch(new RegExp(`/api/rooms/${code}/submission/clarifications${operation === "POST" ? `/${question}/answer` : ""}$`));
    expect(url).not.toContain(identity.token); expect(String(raw.body ?? "")).not.toContain(identity.token);
    if (operation === "GET") { expect(raw.signal).toBe(controller.signal); expect(raw.method ?? "GET").toBe("GET"); expect(raw.body).toBeUndefined(); expect(value).toEqual({ questions: [], state_version: 11 }); }
    else { expect(raw.method).toBe("POST"); expect(headers.get("Content-Type")).toBe("application/json"); expect(JSON.parse(String(raw.body))).toEqual(answer); expect(value).toEqual({ status: "CANCELLED", submission: null }); }
  });

  it("reads the current token for each clarification operation and omits Authorization for a guest", async () => {
    const fetch = vi.fn().mockImplementation(async () => json()); vi.stubGlobal("fetch", fetch);
    await call("GET"); identity.token = "synthetic-account-a-rotated"; await call("POST"); identity.token = null; identity.epoch++; await call("GET");
    expect(fetch.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get("Authorization"))).toEqual(["Bearer synthetic-account-a", "Bearer synthetic-account-a-rotated", null]);
    expect(fetch.mock.calls.every(([, init]) => (init as RequestInit).credentials === "include")).toBe(true);
  });

  it.each(operations.flatMap(operation => [200, 401, 403].map(status => ({ operation, status }))))("discards late $operation HTTP $status after an account switch without leaking its body", async ({ operation, status }) => {
    const pending = deferred<Response>(); const fetch = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal("fetch", fetch);
    const result = call(operation).then(value => ({ value, failure: null }), failure => ({ value: null, failure: failure as ApiError }));
    identity.token = "synthetic-account-b"; identity.epoch++;
    pending.resolve(json({ detail: "previous account private detail", raw_text: "previous account private input" }, status));
    const settled = await result;
    expect(settled.value).toBeNull(); expect(settled.failure).toBeInstanceOf(ApiError);
    expect(settled.failure).toMatchObject({ status: 409, problem: { code: "AUTH_CONTEXT_CHANGED" } });
    expect(settled.failure?.message).not.toContain("previous account private"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(operations.flatMap(operation => [200, 403].map(status => ({ operation, status }))))("rechecks account identity after $operation HTTP $status JSON decoding", async ({ operation, status }) => {
    const body = deferred<unknown>(); const decoding = deferred<void>();
    const fetch = vi.fn().mockResolvedValue({ ok: status === 200, status, headers: new Headers(), json: () => { decoding.resolve(); return body.promise; } }); vi.stubGlobal("fetch", fetch);
    const result = call(operation).then(value => ({ value, failure: null }), failure => ({ value: null, failure: failure as ApiError }));
    await decoding.promise; identity.epoch++; identity.token = "synthetic-account-b";
    body.resolve({ detail: "previous account decoded private detail", raw_text: "previous account decoded private input" });
    const settled = await result;
    expect(settled.value).toBeNull(); expect(settled.failure).toMatchObject({ status: 409, problem: { code: "AUTH_CONTEXT_CHANGED" } });
    expect(settled.failure?.message).not.toContain("previous account decoded private"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(operations.flatMap(operation => [401, 403, 409, 429, 503].map(status => ({ operation, status }))))("preserves current-account $operation HTTP $status without automatic retry, refresh or anonymous fallback", async ({ operation, status }) => {
    const fetch = vi.fn().mockImplementation(async () => json({ code: "SYNTHETIC_CURRENT_ERROR", detail: "합성 현재 계정 요청 오류" }, status)); vi.stubGlobal("fetch", fetch);
    await expect(call(operation)).rejects.toMatchObject({ status, problem: { code: "SYNTHETIC_CURRENT_ERROR", detail: "합성 현재 계정 요청 오류" }, retryAfterSeconds: 3 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends an explicitly retried answer once per click with the same operation UUID and the newly rotated same-account token", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ detail: "합성 결과 미확인" }, 503)).mockImplementation(async () => json({ status: "ANSWERED", submission: null })); vi.stubGlobal("fetch", fetch);
    await expect(call("POST")).rejects.toMatchObject({ status: 503 }); expect(fetch).toHaveBeenCalledTimes(1);
    identity.token = "synthetic-account-a-rotated"; await call("POST");
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toEqual([answer, answer]);
    expect(new Headers((fetch.mock.calls[1]?.[1] as RequestInit).headers).get("Authorization")).toBe("Bearer synthetic-account-a-rotated");
  });
});
