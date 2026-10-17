// Independent #107 room wiring contracts. All network/model behavior is synthetic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";
import { mockRoomAccount } from "../test/roomAccountFixture";

const code = "abcdefghijklmnopqrstuv";
const analysis = "11111111-1111-4111-8111-111111111111";
const round = "22222222-2222-4222-8222-222222222222";
const context = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const off = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const initial: Room = {
  invite_code: code, purpose: "합성 보완 질문 통합", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
  public_status: "NO_MATCH", viewer: { joined: true, display_name: "합성 본인", role: "HOST", context_id: context }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 10, revision_generation: 0, revision_round: null, analysis_id: analysis,
  capabilities: { ...off, can_open_revision: true }, remaining_correction_analyses: 3, clarification_protocol: "owner-clarification-v1",
};
const question = { question_id: questionId, source_revision: 7, excerpt: "내일 7시 가능", question: "오전인가요 오후인가요?", option_a: "내일 오전 7시 가능", option_b: "내일 오후 7시 가능", editable: false };
function opened(snapshot: Room): Room { return { ...snapshot, public_status: "COLLECTING", state_version: 11, revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" }, capabilities: { ...off, can_edit_own_submission: true, can_analyze_revision: snapshot.viewer.role === "HOST" } }; }
function own(text = question.excerpt, revision = 7): Submission { return { raw_text: text, revision, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const clients: QueryClient[] = [];
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } }); clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>) };
}
function fixture(snapshot = initial) {
  mockRoomAccount(snapshot);
  let current = snapshot; let submission = own(); let answered = false;
  const room = vi.spyOn(api, "getRoom").mockImplementation(async () => current);
  const get = vi.spyOn(api, "getClarifications").mockImplementation(async () => ({ questions: answered ? [] : [{ ...question, editable: current.revision_round?.status === "OPEN" }], state_version: current.state_version ?? 0 }));
  vi.spyOn(api, "getSubmission").mockImplementation(async () => submission);
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  const reopen = vi.spyOn(api, "reopenRoom").mockImplementation(async () => { current = opened(current); return { room: current, round: current.revision_round! }; });
  const answer = vi.spyOn(api, "answerClarification").mockImplementation(async () => { submission = own(question.option_b, 8); answered = true; return { status: "ANSWERED", submission }; });
  const analyze = vi.spyOn(api, "analyzeRevision").mockImplementation(async () => { current = { ...current, state_version: 12, public_status: "ANALYZING", revision_round: null, capabilities: off }; return { outcome: "QUEUED", analysis_id: analysis, revision_round_id: round, room: current }; });
  const save = vi.spyOn(api, "saveSubmission");
  return { room, get, reopen, answer, analyze, save, setRoom: (next: Room) => { current = next; } };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

describe("#107 actual RoomPage wiring", () => {
  it.each([undefined, "unknown-future-protocol"])("makes zero clarification GETs without the supported rollout marker (%s)", async marker => {
    const mock = fixture({ ...initial, clarification_protocol: marker as Room["clarification_protocol"] }); view();
    await screen.findByText(initial.purpose);
    expect(mock.get).not.toHaveBeenCalled(); expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("HOST opens a round, answers an initially read-only question and starts analysis only by an explicit action", async () => {
    const mock = fixture(); view();
    const option = await screen.findByRole("radio", { name: question.option_b }); expect(option).toBeDisabled();
    expect(mock.answer).not.toHaveBeenCalled(); expect(mock.analyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "조건 수정 열기" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: question.option_b })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: question.option_b })); fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    await screen.findByText(/답변을 새 입력으로 저장/);
    await screen.findByText("저장된 입력 #8");
    expect(mock.answer).toHaveBeenCalledWith(code, questionId, expect.objectContaining({ revision_round_id: round, expected_revision: 7, choice: "B" }));
    expect(mock.analyze).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    expect(mock.analyze).toHaveBeenCalledTimes(1);
    expect(mock.analyze).toHaveBeenCalledWith(code, expect.objectContaining({ revision_round_id: round, force_reparse: false }));
  });

  it("MEMBER learns an externally opened round through room refresh and answers only their own source revision", async () => {
    const member: Room = { ...initial, viewer: { ...initial.viewer, role: "MEMBER" }, capabilities: off };
    const mock = fixture(member); const screenView = view();
    expect(await screen.findByRole("radio", { name: question.option_b })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
    mock.setRoom(opened(member)); await screenView.client.invalidateQueries({ queryKey: ["room", code] });
    await waitFor(() => expect(screen.getByRole("radio", { name: question.option_b })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: question.option_b })); fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    await screen.findByText(/답변을 새 입력으로 저장/);
    expect(mock.answer).toHaveBeenCalledWith(code, questionId, expect.objectContaining({ expected_revision: 7, revision_round_id: round, choice: "B" }));
    expect(mock.analyze).not.toHaveBeenCalled(); expect(mock.reopen).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "수정한 조건으로 다시 분석" })).not.toBeInTheDocument();
  });

  it("reloads a persisted question into a fresh query client without restoring an unanswered local choice", async () => {
    const mock = fixture(opened(initial)); const first = view();
    fireEvent.click(await screen.findByRole("radio", { name: question.option_b })); first.unmount(); first.client.clear();
    view(); await screen.findByText(question.question);
    expect(screen.getByRole("radio", { name: question.option_b })).not.toBeChecked();
    expect(mock.answer).not.toHaveBeenCalled(); expect(mock.analyze).not.toHaveBeenCalled();
  });

  it("removes actual scoped clarification cache entries when the same room changes viewer", async () => {
    const mock = fixture(opened(initial)); const screenView = view();
    await screen.findByText(question.question);
    const oldKeys = screenView.client.getQueryCache().getAll().filter(query => query.queryKey[0] === "clarifications" && query.queryKey[1] === code).map(query => query.queryKey);
    expect(oldKeys).toHaveLength(1);
    const nextQuestion = { ...question, source_revision: 1, excerpt: "새 참여자 본인 원문", question: "새 참여자 본인 질문", editable: true };
    mock.get.mockResolvedValue({ questions: [nextQuestion], state_version: 12 });
    vi.mocked(api.getSubmission).mockResolvedValue(own(nextQuestion.excerpt, 1));
    mock.setRoom({ ...opened(initial), state_version: 12, viewer: { ...initial.viewer, role: "MEMBER", context_id: "66666666-6666-4666-8666-666666666666" } });
    await screenView.client.invalidateQueries({ queryKey: ["room", code] }); await screen.findByText(nextQuestion.question);
    for (const key of oldKeys) expect(screenView.client.getQueryData(key)).toBeUndefined();
    expect(screen.queryByText(question.question)).not.toBeInTheDocument(); expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument();
    expect(mock.answer).not.toHaveBeenCalled();
  });

  it("blocks HOST analysis while their own clarification answer is still saving", async () => {
    const mock = fixture(opened(initial)); const pending = deferred<Awaited<ReturnType<typeof api.answerClarification>>>(); mock.answer.mockReturnValue(pending.promise);
    view(); fireEvent.click(await screen.findByRole("radio", { name: question.option_b })); fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    const analyzeButton = screen.getByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(analyzeButton).toBeDisabled(); fireEvent.click(analyzeButton);
    expect(mock.analyze).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ status: "ANSWERED", submission: own(question.option_b, 8) }));
  });

  it("purges private caches on revoked room access while answer is pending and ignores its late success", async () => {
    const mock = fixture(opened(initial)); const pending = deferred<Awaited<ReturnType<typeof api.answerClarification>>>(); mock.answer.mockReturnValue(pending.promise);
    const screenView = view(); fireEvent.click(await screen.findByRole("radio", { name: question.option_b })); fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    mock.room.mockRejectedValue(new ApiError(401, { detail: "합성 세션 회수" })); await screenView.client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await act(async () => pending.resolve({ status: "ANSWERED", submission: own(question.option_b, 8) }));
    await waitFor(() => expect(screenView.client.getQueryCache().getAll().filter(query => query.queryKey[1] === code && ["room", "submission", "clarifications"].includes(String(query.queryKey[0])))).toEqual([]));
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument(); expect(screen.queryByText(/답변을 새 입력으로 저장/)).not.toBeInTheDocument();
    expect(mock.analyze).not.toHaveBeenCalled();
  });

  it("never revives a late question GET after another private request denies access", async () => {
    const mock = fixture(opened(initial)); const pending = deferred<Awaited<ReturnType<typeof api.getClarifications>>>(); mock.get.mockReturnValue(pending.promise);
    const screenView = view(); await screen.findByText(initial.purpose);
    await waitFor(() => expect(mock.get).toHaveBeenCalledTimes(1));
    mock.room.mockRejectedValue(new ApiError(403, { detail: "합성 권한 회수" })); await screenView.client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await act(async () => pending.resolve({ questions: [{ ...question, editable: true }], state_version: 11 }));
    await waitFor(() => expect(screenView.client.getQueryCache().getAll().filter(query => query.queryKey[0] === "clarifications" && query.queryKey[1] === code)).toEqual([]));
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument(); expect(mock.answer).not.toHaveBeenCalled();
  });
});
