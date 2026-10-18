import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-10-18T12:00:00Z");
const accountA = { id: "11111111-2222-4333-8444-555555555555", displayName: "합성 계정 A" };
const accountB = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayName: "합성 계정 B" };
const valid = (account = accountA, token = "synthetic-access-A") => ({ accessToken: token, expiresAt: "2026-10-18T12:15:00Z", account });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

// Independent A recovery oracle: FR-109E stays strict. HTTP401 cannot tell
// a missing first-document cookie from a previously lost/replayed cookie.
describe("issue132 explicit account restoration state without replay-policy changes", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("starts idle and remains checking through both HTTP and JSON before publishing authenticated", async () => {
    const http = deferred<Response>(); const body = deferred<unknown>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(http.promise));
    const session = await import("./session");
    expect(session.getSessionRestoreStatus()).toBe("idle");
    const observed: string[] = []; session.subscribeSession(() => observed.push(session.getSessionRestoreStatus()));
    const restoring = session.restoreSession();
    expect(session.getSessionRestoreStatus()).toBe("checking");
    http.resolve({ ok: true, status: 200, json: () => body.promise } as Response);
    await Promise.resolve(); await Promise.resolve();
    expect(session.getSessionRestoreStatus()).toBe("checking"); expect(session.getSession()).toBeNull();
    body.resolve(valid()); await restoring;
    expect(session.getSessionRestoreStatus()).toBe("authenticated"); expect(session.getSession()?.account).toEqual(accountA);
    expect(observed).toContain("checking"); expect(observed.at(-1)).toBe("authenticated");
  });

  it("treats a first401 as anonymous without inventing prior account identity or session expiry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: "AUTH_REFRESH_INVALID" }, 401)); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    await expect(session.restoreSession()).resolves.toBeNull();
    expect(session.getSessionRestoreStatus()).toBe("anonymous"); expect(session.getSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes known in-memory account401 as expired and advances the privacy epoch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(valid())).mockResolvedValueOnce(json({ code: "AUTH_REFRESH_INVALID" }, 401)); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session"); await session.restoreSession(); const before = session.getSessionVersion();
    await session.restoreSession();
    expect(session.getSessionRestoreStatus()).toBe("expired"); expect(session.getSession()).toBeNull(); expect(session.getAccessToken()).toBeNull();
    expect(session.getSessionVersion()).toBeGreaterThan(before); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 429, 503])("classifies HTTP%s as unavailable without automatic retry or pretending to be an ordinary anonymous401", async status => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: "SYNTHETIC_FAILURE", detail: "synthetic-private-provider-detail" }, status)); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session"); await session.restoreSession();
    expect(session.getSessionRestoreStatus()).toBe("unavailable"); expect(session.getSession()).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "invalid-json", "invalid-shape"])("classifies %s as unavailable with no credential/body publication", async failure => {
    const fetchMock = vi.fn();
    if (failure === "network") fetchMock.mockRejectedValue(new TypeError("synthetic-private-provider-detail"));
    else if (failure === "invalid-json") fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));
    else fetchMock.mockResolvedValue(json({ accessToken: "synthetic-private-provider-detail", account: accountA }));
    vi.stubGlobal("fetch", fetchMock); const session = await import("./session"); await session.restoreSession();
    expect(session.getSessionRestoreStatus()).toBe("unavailable"); expect(session.getSession()).toBeNull(); expect(session.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces overlapping explicit/focus restoration requests and preserves identity epoch for same-account rotations", async () => {
    const pending = deferred<Response>(); const fetchMock = vi.fn().mockResolvedValueOnce(json(valid())).mockReturnValueOnce(pending.promise); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session"); await session.restoreSession(); const epoch = session.getSessionVersion();
    const attempts = [session.restoreSession(), session.restoreSession(), session.restoreSession()];
    expect(session.getSessionRestoreStatus()).toBe("checking"); expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.resolve(json(valid(accountA, "synthetic-access-A-rotated"))); await Promise.all(attempts);
    expect(session.getSessionRestoreStatus()).toBe("authenticated"); expect(session.getSessionVersion()).toBe(epoch);
  });

  it.each([200, 401, 503])("fences obsolete HTTP%s and status after explicit logout", async status => {
    const old = deferred<Response>(); const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session"); const pending = session.restoreSession(); await session.endSession();
    expect(session.getSessionRestoreStatus()).toBe("anonymous");
    old.resolve(json(status === 200 ? valid() : { code: "SYNTHETIC_FAILURE" }, status)); await pending;
    expect(session.getSessionRestoreStatus()).toBe("anonymous"); expect(session.getSession()).toBeNull();
  });

  it("fences late successful JSON after logout and a newer B login", async () => {
    const oldJson = deferred<unknown>(); const entered = deferred<void>();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => { entered.resolve(); return oldJson.promise; } } as Response)
      .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(valid(accountB, "synthetic-access-B")));
    vi.stubGlobal("fetch", fetchMock); const session = await import("./session"); const old = session.restoreSession(); await entered.promise;
    await session.endSession(); await session.restoreSession(); oldJson.resolve(valid()); await old;
    expect(session.getSessionRestoreStatus()).toBe("authenticated"); expect(session.getSession()?.account).toEqual(accountB);
    expect(session.getAccessToken()).toBe("synthetic-access-B");
  });

  it("clears the quarantined draft at explicit logout before an uncertain server response completes", async () => {
    const logout = deferred<Response>(); const fetchMock = vi.fn().mockResolvedValueOnce(json(valid())).mockReturnValueOnce(logout.promise); vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session"); const draft = await import("./draftQuarantine"); await session.restoreSession();
    draft.quarantineDraft({ verifiedAccountId: accountA.id, room: "abcdefghijklmnopqrstuv", viewerContext: "22222222-2222-4222-8222-222222222222", candidateBaseRevision: 1, editorKind: "PRECHECK", rawText: "합성 미저장 원문" });
    const pending = session.endSession();
    expect(session.getSessionRestoreStatus()).toBe("anonymous");
    expect(draft.recoverQuarantinedDraft({ verifiedAccountId: accountA.id, room: "abcdefghijklmnopqrstuv", viewerContext: "22222222-2222-4222-8222-222222222222", candidateRevision: 1, editorKind: "PRECHECK" })).toBeNull();
    logout.resolve(json({ code: "SYNTHETIC_FAILURE" }, 503)); await expect(pending).rejects.toThrow();
    expect(session.getSessionRestoreStatus()).toBe("anonymous");
  });

  it("clears A's quarantine when B becomes authenticated even without any mounted room UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(valid())).mockResolvedValueOnce(json(valid(accountB, "synthetic-access-B"))));
    const session = await import("./session"); const draft = await import("./draftQuarantine"); await session.restoreSession();
    draft.quarantineDraft({ verifiedAccountId: accountA.id, room: "abcdefghijklmnopqrstuv", viewerContext: "22222222-2222-4222-8222-222222222222", candidateBaseRevision: 1, editorKind: "PRECHECK", rawText: "A의 합성 미저장 원문" });
    await session.restoreSession();
    expect(draft.recoverQuarantinedDraft({ verifiedAccountId: accountA.id, room: "abcdefghijklmnopqrstuv", viewerContext: "22222222-2222-4222-8222-222222222222", candidateRevision: 1, editorKind: "PRECHECK" })).toBeNull();
    expect(session.getSession()?.account).toEqual(accountB);
  });
});
