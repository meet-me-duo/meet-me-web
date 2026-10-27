import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot, SubmissionCheckStatus } from "../api/precheck";
import * as accountHook from "../auth/useAccount";
import * as session from "../auth/session";
import RoomPage from "./RoomPage";

// Independent PS01–18/20/27–30 + approved PD01/03/04 UI oracle.
// Mock transport proves safe rendering/commands, never model semantics or DB CAS.
const code = "abcdefghijklmnopqrstuv";
const context = "11111111-1111-4111-8111-111111111111";
const checkId = "22222222-2222-4222-8222-222222222222";
const raw = "내일 7~8시 가능, 온라인만 가능";
const acceptedRaw = "이전에 확인 완료한 토요일 오후 조건";
const room: Room = {
  invite_code: code, purpose: "독립 제출 전 확인", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: "2026-10-31T10:00:00Z", manual_only: false,
  collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1,
  viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: context }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1",
};
function version(text = raw, revision = 1) { return { raw_text: text, revision, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" }; }
function snapshot(status?: SubmissionCheckStatus): SubmissionCheckSnapshot {
  return { candidate: status ? version() : null, accepted: null,
    check: status ? { id: checkId, status, version: 1, retry_allowed: ["FAILED", "FAILED_QUEUE", "TIMED_OUT"].includes(status), failure_code: null, question: null } : null,
    submission_complete: false, applied_to_result: false,
    room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: room.submission_deadline }, operation_outcome: null };
}
function choice(): SubmissionCheckSnapshot {
  const value = snapshot("NEEDS_CHOICE");
  value.check!.question = { id: "44444444-4444-4444-8444-444444444444", text: "오전과 오후 중 어느 시간인가요?", source_excerpt: "7~8시", options: [
    { id: "A", text: "오전", proposed_text: "내일 오전 7~8시 가능, 온라인만 가능" },
    { id: "B", text: "오후", proposed_text: "내일 오후 7~8시 가능, 온라인만 가능" },
  ] }; return value;
}
function acceptedVersion(text = raw, revision = 1) { return { ...version(text, revision), confirmation_source: "PRECHECK" as const }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const clients: QueryClient[] = [];
function setup(initial = snapshot(), initialRoom = room) {
  const epoch = vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  vi.spyOn(accountHook, "useAccountSession").mockReturnValue(null);
  const roomRead = vi.spyOn(api, "getRoom").mockResolvedValue(initialRoom);
  const read = vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(initial);
  const start = vi.spyOn(api, "startSubmissionCheck").mockResolvedValue(snapshot("QUEUED"));
  const answer = vi.spyOn(api, "answerSubmissionCheck").mockResolvedValue(snapshot("CHECKING"));
  const retry = vi.spyOn(api, "retrySubmissionCheck").mockResolvedValue(snapshot("QUEUED"));
  const cancel = vi.spyOn(api, "cancelSubmissionCheck").mockResolvedValue(snapshot("CANCELLED"));
  const legacySave = vi.spyOn(api, "saveSubmission"); const legacyRead = vi.spyOn(api, "getSubmission");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  const refresh = async () => { await act(async () => { await client.invalidateQueries({ predicate: query => query.queryKey[0] !== "room" }); }); };
  return { ...view, client, read, start, answer, retry, cancel, legacySave, legacyRead, roomRead, epoch, refresh, rerenderPage: () => view.rerender(tree()) };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
const noComplete = () => expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
async function submit(text = raw) { fireEvent.change(await screen.findByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: /조건 제출하기/ })); }

describe("#107 pre-submit card separates durable save and accepted completion", () => {
  it("preserves exact trimmed text, admits only one double click, and shows saved/checking without completion", async () => {
    const view = setup(); const pending = deferred<SubmissionCheckSnapshot>(); view.start.mockReturnValue(pending.promise);
    const text = "  토요일  오후\n온라인만  "; await submit(text);
    fireEvent.click(screen.getByRole("button", { name: /제출|저장|확인/ }));
    expect(view.start).toHaveBeenCalledTimes(1);
    expect(view.start.mock.calls[0]?.[1]).toMatchObject({ raw_text: text.trim(), expected_revision: 0, request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
    noComplete(); await act(async () => pending.resolve(snapshot("CHECKING")));
    await screen.findByText(/확인 중|확인하고/); noComplete(); expect(view.legacySave).not.toHaveBeenCalled();
    expect(Object.values({ ...localStorage, ...sessionStorage }).join(" ")).not.toContain(text.trim());
  });

  it.each(["QUEUED", "CHECKING", "FAILED", "FAILED_QUEUE", "TIMED_OUT", "LIMIT_REACHED", "CANCELLED", "NEEDS_EDIT"] as const)("restores %s without POST or false completion", async status => {
    const view = setup(snapshot(status)); await waitFor(() => expect(view.read).toHaveBeenCalled());
    expect(await screen.findByText(raw)).toBeInTheDocument(); noComplete();
    expect(view.start).not.toHaveBeenCalled(); expect(view.answer).not.toHaveBeenCalled(); expect(view.legacySave).not.toHaveBeenCalled();
  });

  it("does not equate CLEAR without an accepted completion transaction with submitted", async () => {
    const view = setup(snapshot("CLEAR")); await waitFor(() => expect(view.read).toHaveBeenCalled());
    await screen.findByText(raw); noComplete();
  });

  it.each(["주말 아무 때나 가능", "내일 오후 7시부터 8시까지 온라인 가능", "토요일이나 일요일 중 언제든 괜찮아요"])("accepts synthetic CLEAR for intended broad/context-clear input without a question: %s", async text => {
    const value = snapshot("CLEAR"); value.candidate = version(text); value.accepted = acceptedVersion(text, 4); value.submission_complete = true;
    setup(value); await screen.findByText(/조건 제출을 완료했어요/);
    expect(screen.queryByText(/오전과 오후 중/)).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /직접 수정/ })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(text);
  });

  it("retains an earlier accepted version while a newer candidate is checking", async () => {
    const value = snapshot("CHECKING"); value.accepted = acceptedVersion(acceptedRaw, 8); value.submission_complete = false;
    setup(value); await screen.findByText(acceptedRaw); await screen.findByText(raw);
    expect(document.body).toHaveTextContent(/이전.*확인|마지막.*확인/); expect(document.body).toHaveTextContent(/수정.*확인|확인 중/);
  });

  it("warns before submitting near a deadline that incomplete checks may be excluded", async () => {
    setup(); await screen.findByRole("textbox", { name: /시간·장소 조건/ });
    expect(document.body).toHaveTextContent(/마감.*확인.*반영되지|마감.*반영되지.*확인/);
  });
});

describe("#107 explicit choice, direct edit and failure handling", () => {
  it("keeps source text and full proposed text visible and requires explicit choice confirmation", async () => {
    const view = setup(choice()); await screen.findByText("오전과 오후 중 어느 시간인가요?"); await screen.findByText(raw);
    fireEvent.click(screen.getByRole("button", { name: /오전/ }));
    expect(document.body).toHaveTextContent("내일 오전 7~8시 가능, 온라인만 가능"); expect(view.answer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /이 해석으로 확인|선택 확정|선택한 내용.*확인/ }));
    await waitFor(() => expect(view.answer).toHaveBeenCalledTimes(1));
    expect(view.answer.mock.calls[0]?.[2]).toMatchObject({ expected_revision: 1, expected_check_version: 1, question_id: "44444444-4444-4444-8444-444444444444", choice_id: "A" }); noComplete();
  });

  it("offers a user-edited full replacement without automatically rewriting source", async () => {
    const view = setup(choice()); fireEvent.click(await screen.findByRole("button", { name: /직접 수정/ }));
    const input = screen.getByRole("textbox", { name: /시간·장소 조건|직접 수정/ }); expect(input).toHaveValue(raw);
    fireEvent.change(input, { target: { value: "내일 오후 7~8시 온라인만 가능" } });
    expect(view.answer).not.toHaveBeenCalled(); expect(view.start).not.toHaveBeenCalled();
  });

  it("distinguishes successful server cancel from merely aborting a browser request", async () => {
    const view = setup(choice()); fireEvent.click(await screen.findByRole("button", { name: /확인 취소/ }));
    await waitFor(() => expect(view.cancel).toHaveBeenCalledTimes(1)); await screen.findByText(/취소/); noComplete();
    expect(view.cancel.mock.calls[0]?.[2]).toMatchObject({ expected_revision: 1, expected_check_version: 1 });
  });

  it("keeps private read failure visible instead of treating it as no question/completion", async () => {
    const view = setup(); view.read.mockRejectedValue(new ApiError(503, { code: "SYNTHETIC_READ_FAILURE" })); await view.refresh();
    await screen.findByRole("alert"); noComplete(); expect(view.start).not.toHaveBeenCalled();
  });

  it("recovers a lost POST response with a GET before an explicit same-key retry", async () => {
    const view = setup(); view.start.mockRejectedValue(new TypeError("response lost")); await submit();
    await screen.findByText(/결과.*확인하지|저장 여부.*확인|확인.*실패/); noComplete();
    expect(view.start).toHaveBeenCalledTimes(1); const body = view.start.mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole("button", { name: /저장 여부 확인|진행 상태 확인|현재 상태 확인/ }));
    await waitFor(() => expect(view.read.mock.calls.length).toBeGreaterThan(1)); expect(view.start).toHaveBeenCalledTimes(1);
    const retry = screen.queryByRole("button", { name: /같은 요청 다시|제출 다시 시도/ });
    if (retry) { fireEvent.click(retry); await waitFor(() => expect(view.start).toHaveBeenCalledTimes(2)); expect(view.start.mock.calls[1]?.[1]).toEqual(body); }
  });

  it("keeps a second-tab conflict draft without reporting it accepted", async () => {
    const view = setup(); view.start.mockRejectedValue(new ApiError(409, { code: "SUBMISSION_REVISION_CONFLICT" })); await submit("이 탭에서 쓴 미저장 조건");
    await screen.findByRole("alert"); expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue("이 탭에서 쓴 미저장 조건"); noComplete();
    expect(view.start).toHaveBeenCalledTimes(1);
  });

  it("ignores obsolete operation_outcome when current snapshot is a newer pending candidate", async () => {
    const view = setup(); const current = snapshot("CHECKING"); current.candidate = version("다른 탭의 최신 조건", 3);
    current.operation_outcome = { request_id: "55555555-5555-4555-8555-555555555555", candidate_revision: 1, check_id: "66666666-6666-4666-8666-666666666666", status: "CLEAR" }; view.start.mockResolvedValue(current);
    await submit(); await screen.findByText("다른 탭의 최신 조건"); noComplete();
  });

  it("rejects 501 Unicode code points without truncation or transport", async () => {
    const view = setup(); const input = await screen.findByRole("textbox", { name: /시간·장소 조건/ });
    fireEvent.change(input, { target: { value: "😀".repeat(501) } }); expect(input).toHaveValue("😀".repeat(501));
    expect(screen.getByRole("button", { name: /조건 제출하기/ })).toBeDisabled(); expect(view.start).not.toHaveBeenCalled();
  });
});

describe("#107 ownership and closure fence", () => {
  it("drops a pending old-account response when the account epoch changes", async () => {
    const view = setup(); const pending = deferred<SubmissionCheckSnapshot>(); view.start.mockReturnValue(pending.promise); await submit();
    view.epoch.mockReturnValue(2); view.rerenderPage(); const old = choice(); old.candidate = version("이전 계정의 비공개 원문");
    await act(async () => pending.resolve(old));
    expect(screen.queryByText("이전 계정의 비공개 원문")).not.toBeInTheDocument(); expect(screen.queryByText("오전과 오후 중 어느 시간인가요?")).not.toBeInTheDocument();
  });

  it.each([401, 403, 404])("clears the private card after current read denial %s", async status => {
    const view = setup(choice()); await screen.findByText(raw); view.read.mockRejectedValue(new ApiError(status, { code: "OWNERSHIP_DENIED" })); await view.refresh();
    await waitFor(() => expect(screen.queryByText(raw)).not.toBeInTheDocument()); expect(screen.queryByText("오전과 오후 중 어느 시간인가요?")).not.toBeInTheDocument();
  });

  it("shows first unchecked input as excluded after closure and offers no retry/answer", async () => {
    const value = snapshot("CLOSED_BEFORE_COMPLETION"); value.room = { ...value.room, collection_status: "CLOSED", state_version: 9 };
    const closed: Room = { ...room, collection_status: "CLOSED", public_status: "INSUFFICIENT_PARTICIPANTS", state_version: 9, closure_reason: "MANUAL", closed_at: "2026-10-17T10:01:00Z" };
    setup(value, closed); await screen.findByText(/이번 결과.*반영되지|확인.*반영되지/); noComplete();
    expect(screen.queryByRole("button", { name: /확인 취소|다시 확인|선택 확정/ })).not.toBeInTheDocument();
  });

  it("shows the previous accepted text as applied while a closed pending edit is excluded", async () => {
    const value = snapshot("CLOSED_BEFORE_COMPLETION"); value.accepted = acceptedVersion(acceptedRaw, 7); value.submission_complete = false; value.applied_to_result = true;
    value.room = { ...value.room, collection_status: "CLOSED", state_version: 9 };
    setup(value, { ...room, collection_status: "CLOSED", public_status: "ANALYZING", state_version: 9, closure_reason: "MANUAL", closed_at: "2026-10-17T10:01:00Z" });
    await screen.findByText(acceptedRaw); expect(document.body).toHaveTextContent(/이번.*수정.*반영되지|확인.*반영되지/);
  });
});
