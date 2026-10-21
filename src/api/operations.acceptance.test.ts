import { afterEach, describe, expect, it, vi } from "vitest";
import { operationsApi, operationsMessage, OperationsError } from "./operations";

const roomId = "11000000-0000-4000-8000-000000000001";
const invocationId = "22000000-0000-4000-8000-000000000001";
const room = { id: roomId, created_at: "2026-10-01T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null };
const invocation = { id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
  started_at: "2026-10-01T01:02:00Z", deadline_at: "2026-10-01T01:03:00Z", finished_at: null,
  winner_attempt_id: null, gemini_admitted_attempts: 1, luna_admitted_attempts: 0, execution_ordinal: 2,
  revision_linked: true, recorded_elapsed_millis: null, parser_dispatch_count: null, http_request_count: null };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("operator HTTP read boundary", () => {
  it("uses the three read-only routes with bounded limit and ambient credentials only", async () => {
    const responses = [{ items: [room], next_cursor: null },
      { room, invocations: [invocation], next_cursor: null, revision_counts: { open: 1, queued: 2, reused: 3 }, legacy_attempt_count: 4 },
      { room_id: roomId, invocation, attempts: [], usage_by_provider: [] }];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(responses.shift()), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await operationsApi.rooms("YS1jdXJzb3I");
    await operationsApi.room(roomId, "YS1jdXJzb3I");
    await operationsApi.invocation(invocationId);
    const paths = fetcher.mock.calls.map(([url]) => new URL(String(url), "http://localhost"));
    expect(paths.map(url => url.pathname)).toEqual(["/api/operations/rooms", `/api/operations/rooms/${roomId}`, `/api/operations/invocations/${invocationId}`]);
    for (const url of paths.slice(0, 2)) { expect(url.searchParams.get("limit")).toBe("20"); expect(url.searchParams.get("cursor")).toBe("YS1jdXJzb3I"); }
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({ credentials: "include", cache: "no-store" });
      expect(options?.method ?? "GET").toBe("GET"); expect(options?.body).toBeUndefined();
      const headers = new Headers(options?.headers);
      expect(headers.has("authorization")).toBe(false); expect(headers.has("x-user-id")).toBe(false);
      expect(headers.has("x-operator-id")).toBe(false);
    }
  });
  it.each([400, 401, 403, 404, 503, 500])("does not read or expose arbitrary HTTP %s error payloads", async status => {
    const json = vi.fn().mockResolvedValue({ code: "PRIVATE_CODE", title: "PRIVATE_TITLE", detail: "PRIVATE_RAW", stack: "PRIVATE_STACK" });
    const text = vi.fn().mockResolvedValue("PRIVATE_RAW");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json, text }));
    let error: unknown;
    try { await operationsApi.rooms(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(OperationsError); expect(error).toMatchObject({ status });
    expect(operationsMessage(error)).not.toMatch(/PRIVATE|stack|SQL/);
    expect(json).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
  });
  it("uses a fixed message for arbitrary network exception text", () => {
    expect(operationsMessage(new Error("PRIVATE_DB_PASSWORD"))).toBe("운영 요약 조회에 실패했습니다.");
  });
  it("retains only contract fields from successful responses", async () => {
    const privateText = "PRIVATE_RAW_INPUT_OWNER_TOKEN";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ ...room, raw_text: privateText, owner_id: privateText, purpose: privateText }],
      next_cursor: null, provider_response: privateText,
    }), { status: 200 })));
    const data = await operationsApi.rooms();
    expect(data.items[0]).toEqual(room);
    expect(JSON.stringify(data)).not.toContain(privateText);
  });
  it("rejects malformed successful data with a fixed safe error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ items: "PRIVATE_RAW_INPUT", next_cursor: null }), { status: 200 })));
    let error: unknown;
    try { await operationsApi.rooms(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(OperationsError);
    expect(operationsMessage(error)).not.toContain("PRIVATE_RAW_INPUT");
  });
});
