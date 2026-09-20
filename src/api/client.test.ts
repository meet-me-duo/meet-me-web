import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("always sends credentials and Korean locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ invite_code: "abcdefghijklmnopqrstuv" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getRoom("abcdefghijklmnopqrstuv");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/rooms\/abcdefghijklmnopqrstuv$/), expect.objectContaining({ credentials: "include", headers: expect.objectContaining({ "Accept-Language": "ko-KR" }) }));
  });

  it("preserves stable problem code and retry delay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "RATE_LIMITED", detail: "잠시 후 다시 시도", retry_after_seconds: 7 }), { status: 429, headers: { "Content-Type": "application/problem+json" } })));
    await expect(api.getRoom("abcdefghijklmnopqrstuv")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 7, problem: { code: "RATE_LIMITED" } } satisfies Partial<ApiError>);
  });
});
