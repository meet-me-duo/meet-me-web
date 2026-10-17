import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-10-17T12:00:00Z");
const account = { id: "11111111-2222-4333-8444-555555555555", displayName: "로그인 회원" };
const responseBody = {
  accessToken: "synthetic-service-access",
  expiresAt: "2026-10-17T12:15:00Z",
  account,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

describe("issue #109 service session boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts anonymous and restores the service account through credentialed POST refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(responseBody));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();

    await expect(session.restoreSession()).resolves.toEqual(account);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/auth\/refresh$/), expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(session.getSession()).toEqual(responseBody);
    expect(session.getAccessToken()).toBe(responseBody.accessToken);
  });

  it("keeps credentials and the profile in memory without reading or writing Web Storage", async () => {
    const storageReads = vi.spyOn(Storage.prototype, "getItem");
    const storageWrites = vi.spyOn(Storage.prototype, "setItem");
    const storageRemovals = vi.spyOn(Storage.prototype, "removeItem");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(responseBody)));
    const session = await import("./session");

    await session.restoreSession();
    expect(session.getAccessToken()).toBe(responseBody.accessToken);
    expect(storageReads).not.toHaveBeenCalled();
    expect(storageWrites).not.toHaveBeenCalled();
    expect(storageRemovals).not.toHaveBeenCalled();

    vi.resetModules();
    const freshPage = await import("./session");
    expect(freshPage.getSession()).toBeNull();
    expect(freshPage.getAccessToken()).toBeNull();
  });

  it("coalesces overlapping refresh calls into one rotation request", async () => {
    const waiting = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(waiting.promise);
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");

    const attempts = [session.restoreSession(), session.restoreSession(), session.restoreSession()];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    waiting.resolve(json(responseBody));
    await expect(Promise.all(attempts)).resolves.toEqual([account, account, account]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers of restored and cleared account state and supports unsubscribe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(responseBody)).mockResolvedValue(new Response(null, { status: 204 })));
    const session = await import("./session");
    const subscriber = vi.fn();
    const stop = session.subscribeSession(subscriber);

    await session.restoreSession();
    expect(subscriber).toHaveBeenCalled();
    expect(session.getSession()).toEqual(responseBody);
    subscriber.mockClear();
    await session.endSession();
    expect(subscriber).toHaveBeenCalled();
    expect(session.getSession()).toBeNull();
    subscriber.mockClear();
    stop();
    await session.endSession();
    expect(subscriber).not.toHaveBeenCalled();
  });

  it.each([401, 503])("clears the previous account on refresh HTTP %s without retrying the rotating request", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(responseBody)).mockResolvedValueOnce(json({ code: "AUTH_REFRESH_INVALID" }, status));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    await session.restoreSession();

    await expect(session.restoreSession()).resolves.toBeNull();
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles uncertain refresh network failure as unauthenticated without retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("isolated network failure"));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");

    await expect(session.restoreSession()).resolves.toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...responseBody, accessToken: "" },
    { ...responseBody, expiresAt: "invalid instant" },
    { ...responseBody, expiresAt: "2026-10-17T11:59:59Z" },
    { ...responseBody, account: { displayName: "missing account identity" } },
  ])("rejects malformed or already expired successful refresh payload %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));
    const session = await import("./session");

    await expect(session.restoreSession()).resolves.toBeNull();
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
  });

  it("never sends an Access Token once its exact expiry instant is reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(responseBody)));
    const session = await import("./session");
    await session.restoreSession();

    vi.setSystemTime(new Date("2026-10-17T12:14:59.999Z"));
    expect(session.getAccessToken()).toBe(responseBody.accessToken);
    vi.setSystemTime(new Date(responseBody.expiresAt));
    expect(session.getAccessToken()).toBeNull();
  });

  it.each([
    [false, "/api/auth/logout"],
    [true, "/api/auth/logout-all"],
  ] as const)("clears locally and sends explicit logout allDevices=%s with the current Bearer and cookies", async (allDevices, endpoint) => {
    const logout = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(json(responseBody)).mockReturnValueOnce(logout.promise);
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    await session.restoreSession();

    const completed = session.endSession(allDevices);
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new URL(url, "https://isolated.test").pathname).toBe(endpoint);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${responseBody.accessToken}`);
    logout.resolve(new Response(null, { status: 204 }));
    await completed;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not revive a logged out account when an older refresh finishes later", async () => {
    const oldRefresh = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(oldRefresh.promise).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    const observed: unknown[] = [];
    const listener = vi.fn(() => { observed.push(session.getSession()); });
    session.subscribeSession(listener);

    const pending = session.restoreSession();
    await session.endSession();
    listener.mockClear();
    observed.length = 0;
    oldRefresh.resolve(json(responseBody));
    await expect(pending).resolves.toBeNull();
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(observed).not.toContainEqual(responseBody);
  });

  it("advances the privacy epoch on identity changes and logout while reads leave it stable", async () => {
    const other = { ...responseBody, account: { ...account, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(responseBody)).mockResolvedValueOnce(json(other)).mockResolvedValueOnce(new Response(null, { status: 204 })));
    const session = await import("./session");
    const anonymousEpoch = session.getSessionVersion();
    await session.restoreSession();
    const firstEpoch = session.getSessionVersion();
    expect(firstEpoch).toBeGreaterThan(anonymousEpoch);
    session.getSession();
    session.getAccessToken();
    expect(session.getSessionVersion()).toBe(firstEpoch);
    await session.restoreSession();
    const nextIdentityEpoch = session.getSessionVersion();
    expect(nextIdentityEpoch).toBeGreaterThan(firstEpoch);
    await session.endSession();
    expect(session.getSessionVersion()).toBeGreaterThan(nextIdentityEpoch);
  });

  it.each([200, 401])("an obsolete refresh HTTP %s cannot replace or erase a newer login after logout", async (oldStatus) => {
    const oldRefresh = deferred<Response>();
    const nextAccount = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayName: "새 로그인 회원" };
    const nextSession = { ...responseBody, accessToken: "synthetic-new-account-access", account: nextAccount };
    const fetchMock = vi.fn().mockReturnValueOnce(oldRefresh.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(nextSession));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    const obsolete = session.restoreSession();
    await session.endSession();
    await expect(session.restoreSession()).resolves.toEqual(nextAccount);

    oldRefresh.resolve(json(oldStatus === 200 ? responseBody : { code: "AUTH_REFRESH_INVALID" }, oldStatus));
    await obsolete;
    expect(session.getSession()).toEqual(nextSession);
    expect(session.getAccessToken()).toBe(nextSession.accessToken);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports failed server logout while retaining local logout and never retrying the request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(responseBody)).mockResolvedValueOnce(json({ code: "AUTH_UNAVAILABLE" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const session = await import("./session");
    await session.restoreSession();

    await expect(session.endSession()).rejects.toThrow();
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
