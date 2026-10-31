import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

const code = "synthetic-attendance-room";
const id = "11111111-1111-4111-8111-111111111111";
const selection = { analysis_id: id, variant_id: id, start_at: "2026-12-01T09:00:00Z", end_at: "2026-12-01T10:00:00Z" };
const calls: [string, () => Promise<unknown>][] = [
  ["legacy candidate list", () => api.getCandidates(code)],
  ["primary recommendations", () => api.getRecommendations(code)],
  ["alternative recommendations", () => api.getRecommendationAlternatives(code, { analysis_id: id, cursor: "opaque+/=&?한글" })],
  ["legacy confirmation", () => api.confirmCandidate(code, id)],
  ["typed confirmation", () => api.confirmRecommendation(code, id, selection)],
  ["saved result", () => api.getResult(code)],
];

afterEach(() => vi.unstubAllGlobals());

describe("conditional attendance client support contract", () => {
  it.each(calls)("explicitly advertises semantic support for %s without changing cookie or cache policy", async (_, call) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await call();
    expect(fetch).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetch.mock.calls[0]?.[0]), "https://local.test");
    expect(requestUrl.searchParams.getAll("attendance_support")).toEqual(["conditional-v1"]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store", headers: { "Accept-Language": "ko-KR" } });
    expect(requestUrl.pathname).toContain(encodeURIComponent(code));
    if (requestUrl.pathname.endsWith("/alternatives")) {
      expect(requestUrl.searchParams.get("analysis_id")).toBe(id);
      expect(requestUrl.searchParams.get("cursor")).toBe("opaque+/=&?한글");
    }
    if (requestUrl.pathname.includes("/recommendations/") && requestUrl.pathname.endsWith("/confirmation")) {
      expect(fetch.mock.calls[0]?.[1].body).toBe(JSON.stringify(selection));
    }
  });

  it("preserves a client update conflict without retrying or fabricating a confirmed result", async () => {
    const problem = { code: "CLIENT_UPDATE_REQUIRED", status: 409, detail: "참석 정보를 올바르게 표시하려면 화면을 새로고침해 주세요." };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(problem), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api.confirmRecommendation(code, id, selection)).rejects.toMatchObject({ status: 409, problem });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
