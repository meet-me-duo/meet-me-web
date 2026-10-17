import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OperationsPage from "./OperationsPage";
import type { OperationInvocationDetail, OperationRoom, OperationsApi } from "../api/operations";

const roomId = "11000000-0000-4000-8000-000000000001";
const invocationId = "22000000-0000-4000-8000-000000000001";
const room: OperationRoom = {
  id: roomId, created_at: "2026-10-17T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null,
};
function detail(partial: boolean): OperationInvocationDetail {
  const invocation = {
    id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
    started_at: "2026-10-17T01:00:00Z", deadline_at: "2026-10-17T01:01:00Z", finished_at: null,
    winner_attempt_id: null, gemini_admitted_attempts: partial ? 2 : 1, luna_admitted_attempts: 0,
    execution_ordinal: 1, revision_linked: false, recorded_elapsed_millis: null, http_request_count: null,
    parser_dispatch_count: partial ? null : 0, client_call_count: partial ? null : 0,
    known_client_call_count: partial ? 1 : 0, transport_observed_attempt_count: 1, transport_unknown_attempt_count: partial ? 1 : 0,
  };
  const attempt = {
    id: "44000000-0000-4000-8000-000000000001", attempt_number: 1, provider: "GEMINI", model: "gemini-3.8-flash",
    policy_version: "bounded-luna-v1", started_at: invocation.started_at, finished_at: null,
    failure_kind: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null,
    recorded_elapsed_millis: null, role: "INITIAL", parser_dispatched: partial,
    client_calls: partial ? [{ call_number: 1, elapsed_nanos: 123, outcome: "COMPLETED", http_status: 503 }] : [],
  };
  return { room_id: roomId, invocation, attempts: partial
    ? [attempt, { ...attempt, id: "44000000-0000-4000-8000-000000000002", attempt_number: 2, role: "RETRY", parser_dispatched: null, client_calls: null }]
    : [attempt], usage_by_provider: [] } as OperationInvocationDetail;
}
async function open(partial: boolean) {
  const execution = detail(partial);
  const api: OperationsApi = {
    rooms: vi.fn().mockResolvedValue({ items: [room], next_cursor: null }),
    room: vi.fn().mockResolvedValue({ room, invocations: [execution.invocation], next_cursor: null,
      revision_counts: { open: 0, queued: 0, reused: 0 }, legacy_attempt_count: 0 }),
    invocation: vi.fn().mockResolvedValue(execution),
  };
  const view = render(<OperationsPage api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(roomId) }));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(invocationId) }));
  await screen.findByRole("heading", { name: /로컬.*client call/i });
  return view;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("local client lifecycle operator view", () => {
  it("renders a known zero and explicit non-dispatch without converting missing facts to zero", async () => {
    const { container } = await open(false);
    expect(container).toHaveTextContent(/진입 안 함/);
    const section = screen.getByRole("heading", { name: /로컬.*client call/i }).closest("section")!;
    expect(section).toHaveTextContent(/관측.*1/);
    expect(section).toHaveTextContent(/미관측.*0/);
    expect(section).toHaveTextContent(/알려진.*0/);
    expect(container).not.toHaveTextContent(/공급자 수신 확인|청구 확정|exactly.once/i);
  });
  it("renders partial coverage and safe per-call outcome status and monotonic elapsed", async () => {
    const { container } = await open(true);
    const section = screen.getByRole("heading", { name: /로컬.*client call/i }).closest("section")!;
    expect(section).toHaveTextContent(/관측.*1/);
    expect(section).toHaveTextContent(/미관측.*1/);
    expect(section).toHaveTextContent(/알려진.*1/);
    expect(container).toHaveTextContent("COMPLETED");
    expect(container).toHaveTextContent("503");
    expect(container).toHaveTextContent(/123\s*ns/);
    expect(container).toHaveTextContent("알 수 없음");
    const attempts = container.querySelectorAll("article.operations-attempt");
    expect(within(attempts[1] as HTMLElement).getAllByText("알 수 없음").length).toBeGreaterThan(0);
    expect(container).not.toHaveTextContent(/전체 HTTP 호출 수:\s*1|공급자 수신 확인|청구 확정/);
  });
});
