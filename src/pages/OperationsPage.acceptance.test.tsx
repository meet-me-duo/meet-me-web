import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OperationsPage from "./OperationsPage";
import { OperationsError, type OperationRoom, type OperationInvocation, type OperationsApi } from "../api/operations";

const roomId = "11000000-0000-4000-8000-000000000001";
const secondRoomId = "11000000-0000-4000-8000-000000000002";
const invocationId = "22000000-0000-4000-8000-000000000001";
const secondInvocationId = "22000000-0000-4000-8000-000000000002";
const privateText = "PRIVATE_RAW_PROVIDER_OWNER_TOKEN";
const room: OperationRoom = {
  id: roomId, created_at: "2026-10-01T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null,
};
const invocation: OperationInvocation = {
  id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
  started_at: "2026-10-01T01:02:00Z", deadline_at: "2026-10-01T01:03:00Z", finished_at: null,
  winner_attempt_id: null, gemini_admitted_attempts: 2, luna_admitted_attempts: 1,
  execution_ordinal: 3, revision_linked: true, recorded_elapsed_millis: null, parser_dispatch_count: null, http_request_count: null,
};
function fixtures() {
  const detail = {
    room: { ...room, purpose: privateText, owner_id: privateText, invite_code: privateText },
    invocations: [{ ...invocation, raw_text: privateText }], next_cursor: null,
    revision_counts: { open: 1, queued: 2, reused: 3 }, legacy_attempt_count: 4,
  };
  const execution = {
    room_id: roomId, invocation,
    attempts: [
      { id: "44000000-0000-4000-8000-000000000001", attempt_number: 1, provider: "GEMINI" as const, model: "gemini-test", policy_version: "policy-v1", started_at: invocation.started_at, finished_at: null, failure_kind: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null, recorded_elapsed_millis: null, parser_dispatched: null, role: "INITIAL" as const, owner_token: privateText },
      { id: "44000000-0000-4000-8000-000000000002", attempt_number: 2, provider: "GEMINI" as const, model: "gemini-test", policy_version: "policy-v1", started_at: invocation.started_at, finished_at: invocation.deadline_at, failure_kind: "OTHER", input_tokens: 0, output_tokens: 0, estimated_cost_usd: "0", recorded_elapsed_millis: 123, parser_dispatched: null, role: "RETRY" as const, response_bytes: privateText },
      { id: "44000000-0000-4000-8000-000000000003", attempt_number: 3, provider: "OPENAI" as const, model: "openai-test", policy_version: "policy-v1", started_at: invocation.started_at, finished_at: null, failure_kind: null, input_tokens: 12, output_tokens: 4, estimated_cost_usd: "0.0123", recorded_elapsed_millis: null, parser_dispatched: null, role: "FALLBACK" as const, payload: privateText },
    ],
    usage_by_provider: [
      { provider: "GEMINI" as const, recorded_attempt_count: 2, input_known_count: 1, output_known_count: 1, cost_known_count: 1, input_unknown_count: 1, output_unknown_count: 1, cost_unknown_count: 1, known_input_tokens: 0, known_output_tokens: 0, known_cost_usd: "0", coverage_basis: "RECORDED_ADMISSIONS" as const },
      { provider: "OPENAI" as const, recorded_attempt_count: 1, input_known_count: 0, output_known_count: 0, cost_known_count: 0, input_unknown_count: 1, output_unknown_count: 1, cost_unknown_count: 1, known_input_tokens: null, known_output_tokens: null, known_cost_usd: null, coverage_basis: "RECORDED_ADMISSIONS" as const },
    ],
    provider_response: privateText,
  };
  return { detail, execution };
}
const clients: QueryClient[] = [];
function mount(overrides: Partial<OperationsApi> = {}) {
  const { detail, execution } = fixtures();
  const api: OperationsApi = {
    rooms: vi.fn().mockResolvedValue({ items: [{ ...room, raw_conditions: privateText }], next_cursor: null }),
    room: vi.fn().mockResolvedValue(detail), invocation: vi.fn().mockResolvedValue(execution), ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MemoryRouter><OperationsPage api={api} /></MemoryRouter></QueryClientProvider>);
  return { api, client, ...view };
}
async function openInvocation() {
  fireEvent.click(await screen.findByRole("button", { name: `방 ${roomId}` }));
  fireEvent.click(await screen.findByRole("button", { name: `실행 ${invocationId}` }));
  await screen.findByRole("heading", { name: "실행 기록 상세" });
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("operator summary contract acceptance", () => {
  it.each([[401, "운영자 인증이 필요합니다."], [403, "운영 조회 권한이 없습니다."], [503, "운영 요약을 일시적으로 조회할 수 없습니다."], [404, "조회 대상을 찾을 수 없습니다."], [400, "조회 요청을 확인해 주세요."]] as const)("shows fixed %s state without arbitrary server text or login/grant controls", async (status, message) => {
    const { api, container } = mount({ rooms: vi.fn().mockRejectedValue(Object.assign(new OperationsError(status), { detail: privateText, message: privateText })) });
    await screen.findByText(message);
    expect(container).not.toHaveTextContent(privateText);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(api.room).not.toHaveBeenCalled(); expect(api.invocation).not.toHaveBeenCalled();
  });
  it("has explicit loading and empty states", async () => {
    let resolve!: (value: { items: OperationRoom[]; next_cursor: null }) => void;
    mount({ rooms: vi.fn().mockImplementation(() => new Promise(done => { resolve = done; })) });
    expect(screen.getByRole("status")).toHaveTextContent(/불러|조회|로딩/);
    await act(async () => resolve({ items: [], next_cursor: null }));
    await screen.findByText(/조회할 방이 없|방이 없|기록이 없/);
    expect(screen.queryByRole("button", { name: "다음 방" })).not.toBeInTheDocument();
  });
  it("renders allowlisted current settings and stored history without inferring host submission or publication", async () => {
    const { container } = mount();
    fireEvent.click(await screen.findByRole("button", { name: `방 ${roomId}` }));
    await screen.findByRole("heading", { name: "현재 방 설정" });
    expect(container).toHaveTextContent("2026-10-18");
    expect(container).toHaveTextContent(/현재.*설정/);
    expect(container).toHaveTextContent(/호스트.*미제출/);
    expect(container).toHaveTextContent(/REUSED|재사용/);
    expect(container).toHaveTextContent(/레거시/);
    fireEvent.click(await screen.findByRole("button", { name: `실행 ${invocationId}` }));
    await screen.findByRole("heading", { name: "실행 기록 상세" });
    expect(container).toHaveTextContent(/기록된 경과 시간/);
    expect(container).toHaveTextContent(/HTTP.*알 수 없음/);
    expect(container).toHaveTextContent(/INITIAL/); expect(container).toHaveTextContent(/RETRY/); expect(container).toHaveTextContent(/FALLBACK/);
    expect(container).not.toHaveTextContent(/READY|최종 발행 성공|전체 비용|청구 비용/);
    expect(container).not.toHaveTextContent(privateText);
  });
  it("distinguishes unknown from known zero and calls cost a known-only subtotal", async () => {
    const { container } = mount(); await openInvocation();
    const usage = screen.getAllByRole("table").find(table => within(table).queryByText(/알려진 비용 소계/));
    expect(usage).toBeDefined();
    const rows = within(usage!).getAllByRole("row");
    const gemini = rows.find(row => within(row).queryByText("GEMINI", { exact: true }));
    const openai = rows.find(row => within(row).queryByText("OPENAI", { exact: true }));
    expect(gemini).toBeDefined(); expect(openai).toBeDefined();
    expect(within(gemini!).getAllByText(/^(?:\$|USD )?0(?:\.0+)?$/).length).toBeGreaterThanOrEqual(3);
    expect(within(openai!).getAllByText("알 수 없음").length).toBeGreaterThanOrEqual(3);
    expect(container).toHaveTextContent(/기록된.*시도|기록된.*승인/);
    expect(container).toHaveTextContent(/알려진.*소계/);
    expect(container).not.toHaveTextContent(/총 비용|전체 비용|청구액/);
  });
  it.each([401, 403])("purges all protected snapshots and ignores a late detail success after %s", async status => {
    let complete!: (value: ReturnType<typeof fixtures>["execution"]) => void;
    const rooms = vi.fn().mockResolvedValueOnce({ items: [room], next_cursor: null }).mockRejectedValue(new OperationsError(status));
    const { api, client, container } = mount({ rooms, invocation: vi.fn().mockImplementation(() => new Promise(done => { complete = done; })) });
    fireEvent.click(await screen.findByRole("button", { name: `방 ${roomId}` }));
    fireEvent.click(await screen.findByRole("button", { name: `실행 ${invocationId}` }));
    await waitFor(() => expect(api.invocation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "방 목록" }));
    await screen.findByText(status === 401 ? "운영자 인증이 필요합니다." : "운영 조회 권한이 없습니다.");
    await act(async () => complete(fixtures().execution));
    expect(container).not.toHaveTextContent(roomId); expect(container).not.toHaveTextContent(invocationId);
    expect(container).not.toHaveTextContent("gemini-test");
    for (const query of client.getQueryCache().getAll()) expect(JSON.stringify(query.state.data) ?? "").not.toMatch(/11000000|22000000|gemini-test/);
    expect(screen.queryByRole("button", { name: "방 상세" })).not.toBeInTheDocument();
  });
  it("paginates lists with server cursor and hides next controls at exhaustion", async () => {
    const { detail } = fixtures();
    const rooms = vi.fn().mockResolvedValueOnce({ items: [room], next_cursor: "cm9vbS1uZXh0" }).mockResolvedValue({ items: [{ ...room, id: secondRoomId }], next_cursor: null });
    const readRoom = vi.fn().mockResolvedValueOnce({ ...detail, next_cursor: "cnVuLW5leHQ" }).mockResolvedValue({ ...detail, invocations: [{ ...invocation, id: secondInvocationId }], next_cursor: null });
    mount({ rooms, room: readRoom });
    fireEvent.click(await screen.findByRole("button", { name: "다음 방" }));
    await screen.findByRole("button", { name: `방 ${secondRoomId}` });
    expect(rooms.mock.calls[1]?.[0]).toBe("cm9vbS1uZXh0");
    expect(screen.queryByRole("button", { name: "다음 방" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `방 ${secondRoomId}` }));
    fireEvent.click(await screen.findByRole("button", { name: "다음 실행" }));
    await screen.findByRole("button", { name: `실행 ${secondInvocationId}` });
    expect(readRoom.mock.calls[1]?.[1]).toBe("cnVuLW5leHQ");
    expect(screen.queryByRole("button", { name: "다음 실행" })).not.toBeInTheDocument();
  });
  it("keeps summaries and credentials out of persistent browser storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { container } = mount(); await openInvocation();
    expect(storage).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
