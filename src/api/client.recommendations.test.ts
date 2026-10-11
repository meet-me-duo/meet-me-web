import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

const code = "abcdefghijklmnopqrstuv";
const analysis = "11111111-1111-4111-8111-111111111111";
const option = "22222222-2222-4222-8222-222222222222";
const variant = "33333333-3333-4333-8333-333333333333";
const body = { analysis_id: analysis, variant_id: variant, start_at: "2026-10-08T01:30:00.000Z", end_at: "2026-10-08T02:15:00.000Z" };

function respond(value: unknown = {}, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status, headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function url(fetch: ReturnType<typeof vi.fn>) { return new URL(String(fetch.mock.calls[0]?.[0]), "https://local.test"); }

afterEach(() => vi.unstubAllGlobals());

describe("#19 native diverse-time-v1 HTTP contracts", () => {
  it("reads recommendations with the supplied abort signal and cookie/locale policy", async () => {
    const fetch = respond({ protocol: "diverse-time-v1", analysis_id: analysis });
    const signal = new AbortController().signal;
    await expect(api.getRecommendations(code, signal)).resolves.toMatchObject({ protocol: "diverse-time-v1", analysis_id: analysis });
    expect(url(fetch).pathname).toBe(`/api/rooms/${code}/recommendations`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ signal, credentials: "include", headers: { "Accept-Language": "ko-KR" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requests the first alternatives page with analysis_id and limit 20 and no cursor", async () => {
    const fetch = respond(); const signal = new AbortController().signal;
    await api.getRecommendationAlternatives(code, { analysis_id: analysis, limit: 20 }, signal);
    expect(url(fetch).pathname).toBe(`/api/rooms/${code}/recommendations/alternatives`);
    expect(Object.fromEntries(url(fetch).searchParams)).toEqual({ analysis_id: analysis, limit: "20" });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ signal, credentials: "include" });
  });
  it("round-trips an opaque cursor without decoding, constructing, or losing reserved characters", async () => {
    const fetch = respond(); const cursor = "opaque+/=&?%23한글";
    await api.getRecommendationAlternatives(code, { analysis_id: analysis, limit: 20, cursor });
    expect(Object.fromEntries(url(fetch).searchParams)).toEqual({ analysis_id: analysis, limit: "20", cursor });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends the four required selection fields to the separate recommendation confirmation URL", async () => {
    const response = { confirmed_at: "2026-10-07T12:00:00Z", selection: { protocol: "diverse-time-v1", option_id: option, ...body } };
    const fetch = respond(response);
    await expect(api.confirmRecommendation(code, option, body)).resolves.toEqual(response);
    expect(url(fetch).pathname).toBe(`/api/rooms/${code}/recommendations/${option}/confirmation`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify(body), credentials: "include", headers: { "Content-Type": "application/json", "Accept-Language": "ko-KR" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(url(fetch).pathname).not.toContain("/candidates/");
  });
  it("encodes path segments without allowing an option id to change the endpoint", async () => {
    const fetch = respond();
    await api.confirmRecommendation("room/segment", "option/?#", body);
    expect(url(fetch).pathname).toBe("/api/rooms/room%2Fsegment/recommendations/option%2F%3F%23/confirmation");
  });
  it.each([
    [409, "STALE_ANALYSIS"], [409, "CANDIDATE_ALREADY_CONFIRMED"], [503, "REQUEST_LIMIT_STORE_UNAVAILABLE"],
  ])("preserves RFC9457 %s %s without retry or legacy fallback", async (status, problemCode) => {
    const problem = { status, code: problemCode, detail: "합성 계약 오류", instance: `/api/rooms/${code}/recommendations/${option}/confirmation` };
    const fetch = respond(problem, status);
    await expect(api.confirmRecommendation(code, option, body)).rejects.toMatchObject({ status, problem });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(url(fetch).pathname).toContain("/recommendations/");
  });
});
