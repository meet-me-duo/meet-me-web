// Uses the real published #109 session module. Only transport and the clock are
// synthetic, so expired account -> guest cookie fallback cannot hide in a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const now = new Date("2026-10-17T12:00:00Z");
const expiry = new Date("2026-10-17T12:15:00Z");
const restored = { accessToken: "synthetic-member-access", expiresAt: expiry.toISOString(), account: { id: "11111111-1111-4111-8111-111111111111", displayName: "합성 회원" } };
const code = "abcdefghijklmnopqrstuv";
const question = "22222222-2222-4222-8222-222222222222";
const answer = { request_id: "33333333-3333-4333-8333-333333333333", revision_round_id: "44444444-4444-4444-8444-444444444444", expected_revision: 7, choice: "B" as const };
function json(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }); }
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("#107 clarification operations honor real #109 Access expiry", () => {
  it.each(["GET", "POST"] as const)("stops %s at exact account expiry before a guest-capable network request", async operation => {
    const fetch = vi.fn().mockResolvedValueOnce(json(restored)).mockImplementation(async () => json({ raw_text: "guest-owned private original" })); vi.stubGlobal("fetch", fetch);
    const session = await import("../auth/session"); const { api, ApiError } = await import("./client");
    await session.restoreSession(); expect(session.getSession()?.account).toEqual(restored.account); expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(expiry);
    const result = await (operation === "GET" ? api.getClarifications(code) : api.answerClarification(code, question, answer)).then(value => ({ value, failure: null }), failure => ({ value: null, failure: failure as InstanceType<typeof ApiError> }));
    expect(result.value).toBeNull(); expect(result.failure).toBeInstanceOf(ApiError); expect(result.failure).toMatchObject({ status: 401, problem: { code: "AUTH_ACCESS_EXPIRED" } });
    expect(fetch).toHaveBeenCalledTimes(1); expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/api\/auth\/refresh$/);
  });

  it.each(["GET", "POST"] as const)("uses the real restored service account for %s without persisting its token or private input", async operation => {
    const fetch = vi.fn().mockResolvedValueOnce(json(restored)).mockImplementation(async () => json({ questions: [], state_version: 11 })); vi.stubGlobal("fetch", fetch);
    const session = await import("../auth/session"); const { api } = await import("./client"); await session.restoreSession();
    if (operation === "GET") await api.getClarifications(code); else await api.answerClarification(code, question, answer);
    expect(fetch).toHaveBeenCalledTimes(2); const init = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-member-access"); expect(init.credentials).toBe("include"); expect(init.cache).toBe("no-store");
    expect([...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => String(value).includes(restored.accessToken))).toBe(false);
  });
});
