import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SubmissionCheckSnapshot, SubmissionCheckStatus } from "../api/precheck";
import type { Room } from "../api/types";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// Independent public-state/HTTP regression for web #32 / server #128.
// A stored historical question is not authority to answer after leaving NEEDS_CHOICE.
// Real API client serialization, synthetic fetch only: no backend or model call.
const code = "abcdefghijklmnopqrstuv";
const path = `/api/rooms/${code}/submission/checks`;
const checkId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";
const raw = "토요일 7~8시 온라인만 가능";
const questionText = "오전과 오후 중 어느 시간인가요?";
const proposed = "토요일 오전 7~8시 온라인만 가능";
const room: Room = {
  invite_code: code, purpose: "취소 후 입력 복구와 명시 재확인", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1,
  viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1",
};
const question = () => ({
  id: questionId, text: questionText, source_excerpt: "7~8시",
  options: [{ id: "AM", text: "오전", proposed_text: proposed }, { id: "PM", text: "오후", proposed_text: "토요일 오후 7~8시 온라인만 가능" }],
});
function snapshot(status: SubmissionCheckStatus, retainedQuestion = false, text = raw, revision = 4, version = 9): SubmissionCheckSnapshot {
  const candidate = { revision, raw_text: text, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" };
  return {
    candidate, accepted: status === "CLEAR" ? { ...candidate, confirmation_source: "PRECHECK" } : null,
    check: { id: checkId, status, version, retry_allowed: ["FAILED", "TIMED_OUT"].includes(status), failure_code: null, question: retainedQuestion ? question() : null },
    submission_complete: status === "CLEAR", applied_to_result: false,
    room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null,
  };
}
type Write = { path: string; body: Record<string, unknown> };
const clients: QueryClient[] = [];
function setup(initial: SubmissionCheckSnapshot) {
  vi.spyOn(session, "getAccessToken").mockReturnValue(null);
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  let state = initial;
  const writes: Write[] = [];
  const reads: string[] = [];
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? "GET";
    if (method === "GET" && url === `${path}/current`) {
      reads.push(url); return new Response(JSON.stringify(state), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (method === "POST" && [path, `${path}/${checkId}/answer`, `${path}/${checkId}/retry`, `${path}/${checkId}/cancel`].includes(url)) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      writes.push({ path: url, body });
      if (url.endsWith("/cancel")) state = snapshot("CANCELLED", true, raw, 4, 10);
      else if (url.endsWith("/retry")) state = snapshot("QUEUED", false, state.candidate!.raw_text, 4, 10);
      else if (url.endsWith("/answer")) state = snapshot("CHECKING", false, String(body.direct_text ?? proposed), 5, 10);
      else state = snapshot("QUEUED", false, String(body.raw_text), 5, 1);
      return new Response(JSON.stringify(state), { status: url.endsWith("/cancel") ? 200 : 202, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected synthetic HTTP ${method} ${url}`);
  });
  vi.stubGlobal("fetch", transport);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  return { writes, reads, transport, set: (next: SubmissionCheckSnapshot) => { state = next; }, refresh: async () => { await act(async () => { await client.invalidateQueries(); }); } };
}
afterEach(() => {
  cleanup(); for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
});
const noComplete = () => expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
function noActiveQuestion() {
  expect(screen.queryByRole("heading", { name: questionText })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^(오전|오후|직접 수정|선택한 내용으로 확인)$/ })).not.toBeInTheDocument();
}
async function openEditor() {
  if (!screen.queryByRole("textbox", { name: /시간·장소 조건/ })) fireEvent.click(screen.getByRole("button", { name: "내 조건 수정" }));
  return screen.findByRole("textbox", { name: /시간·장소 조건/ });
}

describe("#32 historical questions never reopen a terminated check", () => {
  it("cancels a visible question, preserves the raw input and starts a fresh request without an old answer", async () => {
    const view = setup(snapshot("NEEDS_CHOICE", true));
    await screen.findByRole("heading", { name: questionText });
    fireEvent.click(screen.getByRole("button", { name: "확인 취소" }));
    await screen.findByText(/확인을 취소했어요/);
    expect(view.writes).toHaveLength(1);
    expect(view.writes[0]).toEqual({ path: `${path}/${checkId}/cancel`, body: { request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), expected_revision: 4, expected_check_version: 9 } });
    noActiveQuestion(); noComplete(); expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    const editor = await openEditor(); expect(editor).toHaveValue(raw);
    fireEvent.change(editor, { target: { value: "토요일 오후 7~8시 온라인만 가능" } });
    expect(view.writes).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 확인" }));
    await waitFor(() => expect(view.writes).toHaveLength(2));
    expect(view.writes[1]).toEqual({ path, body: { request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), expected_revision: 4, raw_text: "토요일 오후 7~8시 온라인만 가능" } });
    expect(view.writes[1]!.body.request_id).not.toBe(view.writes[0]!.body.request_id);
    expect(view.writes.some(write => write.path.endsWith("/answer"))).toBe(false);
    await screen.findByText(/모호한 부분을 확인 중/); noComplete();
  });

  it.each(["FAILED", "TIMED_OUT"] as const)("restores %s without activating a retained historical question", async status => {
    const view = setup(snapshot(status, true));
    await screen.findByText(status === "FAILED" ? /확인에 실패했어요/ : /확인 시간이 초과됐어요/);
    noActiveQuestion(); noComplete();
    expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    expect(await openEditor()).toHaveValue(raw);
    expect(view.writes).toEqual([]);
  });

  it("keeps a completed CLEAR snapshot free of historical answer controls", async () => {
    const view = setup(snapshot("CLEAR", true));
    await screen.findByText("제출 완료 · 다른 참여자를 기다려 주세요.");
    noActiveQuestion(); expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 조건 수정" })).toBeEnabled();
    expect(view.writes).toEqual([]);
  });

  it("preserves valid NEEDS_CHOICE, original text and the full proposal until explicit confirmation", async () => {
    const view = setup(snapshot("NEEDS_CHOICE", true));
    await screen.findByRole("heading", { name: questionText });
    fireEvent.click(screen.getByRole("button", { name: "오전" }));
    expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(proposed, { exact: true })).toBeInTheDocument();
    expect(view.writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "선택한 내용으로 확인" }));
    await waitFor(() => expect(view.writes).toHaveLength(1));
    expect(view.writes[0]).toEqual({ path: `${path}/${checkId}/answer`, body: { request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), expected_revision: 4, expected_check_version: 9, question_id: questionId, choice_id: "AM" } });
    await screen.findByText(/모호한 부분을 확인 중/); noComplete();
  });
});

describe("#32 complete retry and direct-edit flows through the public API client", () => {
  it("retries a failed check explicitly, remains pending, then completes only on accepted CLEAR", async () => {
    const view = setup(snapshot("FAILED"));
    await screen.findByText(/확인에 실패했어요/);
    fireEvent.click(await screen.findByRole("button", { name: "다시 확인" }));
    await screen.findByText(/모호한 부분을 확인 중/); noComplete();
    expect(view.writes).toEqual([{ path: `${path}/${checkId}/retry`, body: { request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), expected_revision: 4, expected_check_version: 9 } }]);
    const unaccepted = snapshot("CLEAR", false, raw, 4, 11); unaccepted.accepted = null; unaccepted.submission_complete = false;
    view.set(unaccepted); await view.refresh(); noComplete();
    view.set(snapshot("CLEAR", false, raw, 4, 12)); await view.refresh();
    await screen.findByText("제출 완료 · 다른 참여자를 기다려 주세요.");
    expect(document.body).toHaveTextContent(/다른 참여자를 기다려/);
    expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    expect(view.writes).toHaveLength(1); expect(view.reads.length).toBeGreaterThanOrEqual(3);
  });

  it("submits an explicit direct-text answer, rechecks the whole edited text and then displays accepted CLEAR", async () => {
    const view = setup(snapshot("NEEDS_CHOICE", true));
    fireEvent.click(await screen.findByRole("button", { name: "직접 수정" }));
    const editor = screen.getByRole("textbox", { name: /시간·장소 조건/ }); expect(editor).toHaveValue(raw);
    const edited = "토요일  오후 7시부터 8시까지\n온라인만 가능";
    fireEvent.change(editor, { target: { value: `  ${edited}  ` } });
    expect(view.writes).toEqual([]); expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수정한 내용 확인" }));
    await waitFor(() => expect(view.writes).toHaveLength(1));
    expect(view.writes[0]).toEqual({ path: `${path}/${checkId}/answer`, body: { request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), expected_revision: 4, expected_check_version: 9, question_id: questionId, direct_text: edited } });
    await screen.findByText(/모호한 부분을 확인 중/); noComplete();
    view.set(snapshot("CLEAR", false, edited, 5, 11)); await view.refresh();
    await screen.findByText("제출 완료 · 다른 참여자를 기다려 주세요.");
    expect(screen.getByText(edited, { exact: true, normalizer: value => value })).toBeInTheDocument();
    noActiveQuestion(); expect(view.writes).toHaveLength(1);
  });
});
