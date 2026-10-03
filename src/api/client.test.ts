import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, errorMessage } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("sends only raw_text when saving natural-language conditions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: 2, raw_text: "월요일 저녁", manual_available_times: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.saveSubmission("abcdefghijklmnopqrstuv", { raw_text: "월요일 저녁" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/submission$/), expect.objectContaining({ method: "PUT", body: JSON.stringify({ raw_text: "월요일 저녁" }), credentials: "include" }));
  });

  it.each([
    ["SUBMISSION_INPUT_REQUIRED", "자연어로 입력"],
    ["SUBMISSION_TEXT_TOO_LONG", "500자 이하"],
    ["SUBMISSION_MANUAL_AVAILABILITY_UNSUPPORTED", "자연어로 다시 입력"],
  ])("explains %s in Korean", (code, message) => {
    expect(errorMessage(new ApiError(400, { code }))).toContain(message);
  });

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
