import { afterEach, describe, expect, it, vi } from "vitest";
import { operationsApi, OperationsError } from "./operations";

const roomId = "11000000-0000-4000-8000-000000000001";
const invocationId = "22000000-0000-4000-8000-000000000001";
const invocation = {
  id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
  started_at: "2026-10-17T01:00:00Z", deadline_at: "2026-10-17T01:01:00Z", finished_at: null,
  winner_attempt_id: null, gemini_admitted_attempts: 1, luna_admitted_attempts: 0,
  execution_ordinal: 1, revision_linked: false, recorded_elapsed_millis: null,
  parser_dispatch_count: null, http_request_count: null,
};
const attempt = {
  id: "44000000-0000-4000-8000-000000000001", attempt_number: 1, provider: "GEMINI", model: "gemini-test",
  policy_version: "bounded-luna-v1", started_at: invocation.started_at, finished_at: null,
  failure_kind: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null,
  recorded_elapsed_millis: null, parser_dispatched: null, role: "INITIAL",
};
function respond(summary: object, attempts: object[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    room_id: roomId, invocation: { ...invocation, ...summary }, attempts, usage_by_provider: [],
  }), { status: 200 })));
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("local transport v2 response boundary", () => {
  it("retains explicit not-dispatched and known zero without claiming an HTTP request count", async () => {
    respond({ transport_observed_attempt_count: 1, transport_unknown_attempt_count: 0,
      parser_dispatch_count: 0, client_call_count: 0, known_client_call_count: 0 },
    [{ ...attempt, parser_dispatched: false, client_calls: [] }]);
    const result = await operationsApi.invocation(invocationId);
    expect(result.invocation).toMatchObject({ parser_dispatch_count: 0, client_call_count: 0,
      known_client_call_count: 0, transport_observed_attempt_count: 1, transport_unknown_attempt_count: 0, http_request_count: null });
    expect(result.attempts[0]).toMatchObject({ parser_dispatched: false, client_calls: [] });
  });
  it("retains bounded lifecycle facts but strips URL headers body and exception details", async () => {
    respond({ transport_observed_attempt_count: 1, transport_unknown_attempt_count: 0,
      parser_dispatch_count: 1, client_call_count: 1, known_client_call_count: 1 },
    [{ ...attempt, parser_dispatched: true, client_calls: [{ call_number: 1, elapsed_nanos: 123,
      outcome: "COMPLETED", http_status: 503, url: "PRIVATE_URL", headers: "PRIVATE_HEADERS", body: "PRIVATE_BODY", exception: "PRIVATE_ERROR" }] }]);
    const result = await operationsApi.invocation(invocationId);
    expect(result.attempts[0]).toMatchObject({ parser_dispatched: true,
      client_calls: [{ call_number: 1, elapsed_nanos: 123, outcome: "COMPLETED", http_status: 503 }] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("keeps partial known-only local calls separate from unknown complete counts", async () => {
    respond({ gemini_admitted_attempts: 2, transport_observed_attempt_count: 1, transport_unknown_attempt_count: 1,
      parser_dispatch_count: null, client_call_count: null, known_client_call_count: 1 },
    [{ ...attempt, parser_dispatched: true, client_calls: [{ call_number: 1, elapsed_nanos: 0, outcome: "FAILED", http_status: null }] },
      { ...attempt, id: "44000000-0000-4000-8000-000000000002", attempt_number: 2, parser_dispatched: null, client_calls: null }]);
    const result = await operationsApi.invocation(invocationId);
    expect(result.invocation).toMatchObject({ client_call_count: null, known_client_call_count: 1, transport_unknown_attempt_count: 1 });
    expect(result.attempts[1]).toMatchObject({ parser_dispatched: null, client_calls: null });
  });
  it("maps a legacy response without v2 fields to unknown coverage rather than known zero", async () => {
    respond({}, [attempt]);
    const result = await operationsApi.invocation(invocationId);
    expect(result.invocation).toMatchObject({ client_call_count: null, known_client_call_count: 0,
      transport_observed_attempt_count: 0, transport_unknown_attempt_count: 1 });
    expect(result.attempts[0]).toMatchObject({ parser_dispatched: null, client_calls: null });
  });
  it.each([
    { call_number: 0, elapsed_nanos: 1, outcome: "COMPLETED", http_status: 200 },
    { call_number: 1, elapsed_nanos: -1, outcome: "COMPLETED", http_status: 200 },
    { call_number: 1, elapsed_nanos: 1, outcome: "PROVIDER_RECEIVED", http_status: 200 },
    { call_number: 1, elapsed_nanos: 1, outcome: "COMPLETED", http_status: 600 },
  ])("rejects malformed local facts without rendering their payload", async call => {
    respond({ transport_observed_attempt_count: 1, transport_unknown_attempt_count: 0,
      parser_dispatch_count: 1, client_call_count: 1, known_client_call_count: 1 },
    [{ ...attempt, parser_dispatched: true, client_calls: [call] }]);
    await expect(operationsApi.invocation(invocationId)).rejects.toBeInstanceOf(OperationsError);
  });
});
