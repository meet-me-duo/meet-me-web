import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-10-17T12:00:00Z");
const EXPIRES_AT = new Date("2026-10-17T12:15:00Z");
const account = { id: "11111111-2222-4333-8444-555555555555", displayName: "로그인 회원" };
const restored = { accessToken: "synthetic-service-access", expiresAt: EXPIRES_AT.toISOString(), account };
const roomCode = "abcdefghijklmnopqrstuv";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("#109 expired local account cannot fall back to guest cookies", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(["private GET", "submission PUT"] as const)("rejects %s before any guest-capable fetch at the exact Access expiry", async operation => {
    // The session and client modules are real. Only transport and wall-clock time are synthetic.
    const fetch = vi.fn().mockResolvedValueOnce(json(restored)).mockImplementation(async () => json({ raw_text: "guest-owned input" }));
    vi.stubGlobal("fetch", fetch);
    const session = await import("../auth/session");
    const { api, ApiError } = await import("./client");
    await expect(session.restoreSession()).resolves.toEqual(account);
    expect(session.getSession()?.account).toEqual(account);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(EXPIRES_AT);
    expect(session.getSession()?.account).toEqual(account);

    const request = operation === "private GET"
      ? api.getSubmission(roomCode)
      : api.saveSubmission(roomCode, { raw_text: "current account private draft" });
    const result = await request.then(() => null, (error: unknown) => error);

    expect(result).toBeInstanceOf(ApiError);
    expect(result).toMatchObject({ status: 401, problem: { code: "AUTH_ACCESS_EXPIRED" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/api\/auth\/refresh$/);
  });

  it("bypasses browser HTTP cache when fetching private submission data for a valid account", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(restored)).mockResolvedValueOnce(json({ raw_text: "current account private input" }));
    vi.stubGlobal("fetch", fetch);
    const session = await import("../auth/session");
    const { api } = await import("./client");
    await session.restoreSession();

    await api.getSubmission(roomCode);

    expect(fetch).toHaveBeenCalledTimes(2);
    const init = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-service-access");
  });
});
