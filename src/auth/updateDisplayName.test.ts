import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const account = { id: "11111111-2222-4333-8444-555555555555", displayName: "서윤", capabilities: { canViewOperations: false } };
const renamed = { ...account, displayName: "새 이름" };
const other = { ...account, id: "22222222-2222-4333-8444-555555555555", displayName: "다른 계정" };
const auth = (profile = account, token = "synthetic-old-token") => ({ accessToken: token, expiresAt: "2099-01-01T00:00:00Z", account: profile });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }

async function setup() {
  const fetchMock = vi.fn().mockResolvedValueOnce(json(auth()));
  vi.stubGlobal("fetch", fetchMock);
  const session = await import("./session");
  const { updateDisplayName } = await import("./updateDisplayName");
  await session.restoreSession();
  return { fetchMock, session, updateDisplayName };
}

beforeEach(() => vi.resetModules());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("account display name update", () => {
  it("uses authenticated PUT then normal refresh, preserving epoch and using the new server token", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    const version = session.getSessionVersion();
    const held = deferred<Response>();
    fetchMock.mockResolvedValueOnce(json(renamed)).mockReturnValueOnce(held.promise);
    const saving = updateDisplayName(renamed.displayName);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]).toEqual(["/api/auth/me", expect.objectContaining({ method: "PUT", credentials: "include", cache: "no-store", body: JSON.stringify({ displayName: renamed.displayName }), headers: expect.objectContaining({ Authorization: "Bearer synthetic-old-token", "Content-Type": "application/json" }) })]);
    expect(session.getSession()).toEqual(auth(renamed));
    held.resolve(json(auth(renamed, "synthetic-refreshed-token")));
    await expect(saving).resolves.toEqual({ status: "updated", version });
    expect(session.getSession()).toEqual(auth(renamed, "synthetic-refreshed-token"));
    expect(session.getSessionVersion()).toBe(version);
    expect(fetchMock.mock.calls[2]![1]).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("settles an older rotating refresh before starting a fresh one and prevents old-name reversal", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    const held = deferred<Response>();
    fetchMock.mockReturnValueOnce(held.promise).mockResolvedValueOnce(json(renamed)).mockResolvedValueOnce(json(auth(renamed, "fresh")));
    const older = session.restoreSession();
    const saving = updateDisplayName(renamed.displayName);
    await vi.waitFor(() => expect(session.getSession()?.account.displayName).toBe(renamed.displayName));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const observed: string[] = [];
    const stop = session.subscribeSession(() => { const name = session.getSession()?.account.displayName; if (name) observed.push(name); });
    held.resolve(json(auth(account, "older-refresh")));
    await older;
    await expect(saving).resolves.toMatchObject({ status: "updated" });
    stop();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(observed).not.toContain(account.displayName);
    expect(session.getAccessToken()).toBe("fresh");
  });

  it.each([401, 503])("reports saved profile separately from failed refresh %s without retry", async status => {
    const { fetchMock, session, updateDisplayName } = await setup();
    fetchMock.mockResolvedValueOnce(json(renamed)).mockResolvedValueOnce(json({}, status));
    await expect(updateDisplayName(renamed.displayName)).resolves.toEqual({ status: "saved_session_unavailable", version: session.getSessionVersion() + 1 });
    expect(session.getSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a failed pre-existing refresh or mint a session after confirmed PUT", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    const held = deferred<Response>();
    fetchMock.mockReturnValueOnce(held.promise).mockResolvedValueOnce(json(renamed));
    void session.restoreSession();
    const saving = updateDisplayName(renamed.displayName);
    await vi.waitFor(() => expect(session.getSession()?.account.displayName).toBe(renamed.displayName));
    held.resolve(json({}, 503));
    await expect(saving).resolves.toMatchObject({ status: "saved_session_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(session.getSession()).toBeNull();
  });

  it("ignores delayed PUT after logout and a different account login", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    const held = deferred<Response>();
    fetchMock.mockReturnValueOnce(held.promise).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(auth(other)));
    const saving = updateDisplayName(renamed.displayName);
    const assertion = expect(saving).rejects.toMatchObject({ problem: { code: "AUTH_CONTEXT_CHANGED" } });
    await session.endSession();
    await session.restoreSession();
    held.resolve(json(renamed));
    await assertion;
    expect(session.getSession()?.account).toEqual(other);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not report the previous owner's success when refresh authenticates a different cookie owner", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    fetchMock.mockResolvedValueOnce(json(renamed)).mockResolvedValueOnce(json(auth(other)));
    await expect(updateDisplayName(renamed.displayName)).resolves.toEqual({ status: "stale" });
    expect(session.getSession()?.account).toEqual(other);
  });

  it("cannot undo explicit logout during the post-save refresh", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    const held = deferred<Response>();
    fetchMock.mockResolvedValueOnce(json(renamed)).mockReturnValueOnce(held.promise).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const saving = updateDisplayName(renamed.displayName);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await session.endSession();
    held.resolve(json(auth(renamed, "late")));
    await expect(saving).resolves.toEqual({ status: "stale" });
    expect(session.getSession()).toBeNull();
  });

  it.each([other, { ...renamed, capabilities: null }, { ...renamed, displayName: "" }])("rejects malformed or mismatched account responses without changing session %#", async value => {
    const { fetchMock, session, updateDisplayName } = await setup();
    fetchMock.mockResolvedValueOnce(json(value));
    await expect(updateDisplayName(renamed.displayName)).rejects.toThrow("Invalid account response");
    expect(session.getSession()).toEqual(auth());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the editor retryable after failed PUT and performs no automatic mutation or refresh retry", async () => {
    const { fetchMock, session, updateDisplayName } = await setup();
    fetchMock.mockResolvedValueOnce(json({ code: "AUTH_UNAVAILABLE" }, 503));
    await expect(updateDisplayName(renamed.displayName)).rejects.toMatchObject({ status: 503 });
    expect(session.getSession()).toEqual(auth());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
