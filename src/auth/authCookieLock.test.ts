import { afterEach, describe, expect, it, vi } from "vitest";
import { runAuthCookieRequest } from "./authCookieLock";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

afterEach(() => vi.unstubAllGlobals());

describe("issue #109 shared-browser auth cookie serialization", () => {
  it("calls the action exactly once when Web Locks are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const action = vi.fn().mockResolvedValue("synthetic response");
    await expect(runAuthCookieRequest(action)).resolves.toBe("synthetic response");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("requests the shared lock and waits for its grant before invoking the cookie action", async () => {
    const granted = deferred<void>();
    const request = vi.fn((_name: string, callback: () => Promise<string>) => granted.promise.then(callback));
    vi.stubGlobal("navigator", { locks: { request } });
    const action = vi.fn().mockResolvedValue("synthetic response");

    const pending = runAuthCookieRequest(action);
    expect(request).toHaveBeenCalledWith("meetme-refresh", expect.any(Function));
    expect(action).not.toHaveBeenCalled();
    granted.resolve();
    await expect(pending).resolves.toBe("synthetic response");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("keeps the lock callback pending until the entire supplied async action completes", async () => {
    const response = deferred<string>();
    let released = false;
    const request = vi.fn((_name: string, callback: () => Promise<string>) => Promise.resolve(callback()).then(value => { released = true; return value; }));
    vi.stubGlobal("navigator", { locks: { request } });
    const action = vi.fn().mockReturnValue(response.promise);

    const pending = runAuthCookieRequest(action);
    await Promise.resolve();
    expect(released).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    response.resolve("synthetic decoded response");
    await expect(pending).resolves.toBe("synthetic decoded response");
    expect(released).toBe(true);
  });

  it("propagates a cookie action failure once without retrying inside or outside the lock", async () => {
    const failure = new TypeError("isolated cookie request failure");
    const action = vi.fn().mockRejectedValue(failure);
    const request = vi.fn((_name: string, callback: () => Promise<never>) => callback());
    vi.stubGlobal("navigator", { locks: { request } });

    await expect(runAuthCookieRequest(action)).rejects.toBe(failure);
    expect(action).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
