// Independent #107 question-identity oracle: each explicit answer belongs to one
// (question_id, source_revision), even when room and viewer remain unchanged.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { ClarificationAnswerResult, ClarificationList, ClarificationQuestion } from "../api/clarifications";
import type { Room, Submission } from "../api/types";
import ClarificationPanel from "./ClarificationPanel";

const code = "abcdefghijklmnopqrstuv";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const round = "44444444-4444-4444-8444-444444444444";
const room: Room = {
  invite_code: code, purpose: "합성 동일 본인 질문 교체", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
  public_status: "COLLECTING", viewer: { joined: true, display_name: "합성 본인", role: "MEMBER", context_id: owner },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", state_version: 11, revision_generation: 1,
  revision_round: { id: round, generation: 1, status: "OPEN" }, analysis_id: firstId,
  capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false },
  remaining_correction_analyses: 3, clarification_protocol: "owner-clarification-v1",
};
const q1: ClarificationQuestion = { question_id: firstId, source_revision: 7, excerpt: "내일 7시 가능", question: "첫 원문은 오전인가요 오후인가요?", option_a: "내일 오전 7시 가능", option_b: "내일 오후 7시 가능", editable: true };
const q2: ClarificationQuestion = { question_id: secondId, source_revision: 9, excerpt: "모레 8시는 불가", question: "새 원문의 불가 시간은 오전인가요 오후인가요?", option_a: "모레 오전 8시는 불가", option_b: "모레 오후 8시는 불가", editable: true };
function own(text: string, revision: number): Submission { return { raw_text: text, revision, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" }; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const clients: QueryClient[] = [];
function mount() {
  const get = vi.spyOn(api, "getClarifications").mockResolvedValue({ questions: [q1], state_version: 11 });
  const post = vi.spyOn(api, "answerClarification").mockResolvedValue({ status: "ANSWERED", submission: own(q1.option_a, 8) });
  const analyze = vi.spyOn(api, "analyzeRevision"); const onSaved = vi.fn(); const onAccessDenied = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } }); clients.push(client);
  const rendered = render(<QueryClientProvider client={client}><ClarificationPanel room={room} onSaved={onSaved} onAccessDenied={onAccessDenied} /></QueryClientProvider>);
  async function receive(questions: ClarificationQuestion[], state_version = 12) {
    get.mockResolvedValue({ questions, state_version });
    await act(async () => { await client.invalidateQueries({ queryKey: ["clarifications", code] }); });
  }
  const rerenderRoom = (nextRoom: Room) => rendered.rerender(<QueryClientProvider client={client}><ClarificationPanel room={nextRoom} onSaved={onSaved} onAccessDenied={onAccessDenied} /></QueryClientProvider>);
  return { get, post, analyze, onSaved, onAccessDenied, client, receive, rerenderRoom };
}
async function choose(question: ClarificationQuestion, choice: "A" | "B") { fireEvent.click(await screen.findByRole("radio", { name: choice === "A" ? question.option_a : question.option_b })); }
async function direct(text: string) { fireEvent.click(await screen.findByRole("radio", { name: "직접 입력" })); fireEvent.change(screen.getByRole("textbox"), { target: { value: text } }); }
function save() { fireEvent.click(screen.getByRole("button", { name: "답변 저장" })); }
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

describe("#107 explicit answer intent belongs to its question identity", () => {
  it.each(["A", "DIRECT"] as const)("drops Q1 %s selection when Q2 replaces it, requiring a new explicit choice", async choice => {
    const view = mount(); const oldText = "첫 질문에만 해당하는 직접 입력 원문";
    if (choice === "A") await choose(q1, "A"); else await direct(oldText);
    await view.receive([q2]); await screen.findByText(q2.question);
    expect(screen.getByRole("radio", { name: q2.option_a })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: q2.option_b })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "직접 입력" })).not.toBeChecked();
    expect(screen.queryByDisplayValue(oldText)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "답변 저장" }); expect(button).toBeDisabled(); fireEvent.click(button);
    expect(view.post).not.toHaveBeenCalled(); expect(view.analyze).not.toHaveBeenCalled();
  });

  it("keeps an unanswered direct draft and selection across a refetch of the identical question", async () => {
    const view = mount(); const text = "동일한 질문에서 작성 중인 전체 조건"; await direct(text);
    await view.receive([{ ...q1 }]);
    expect(screen.getByRole("radio", { name: "직접 입력" })).toBeChecked();
    expect(screen.getByRole("textbox")).toHaveValue(text); expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled();
    expect(view.post).not.toHaveBeenCalled();
  });

  it("also requires a fresh choice if a source revision changes while the question ID is reused", async () => {
    const view = mount(); await choose(q1, "A");
    await view.receive([{ ...q2, question_id: q1.question_id }]); await screen.findByText(q2.question);
    expect(screen.getByRole("radio", { name: q2.option_a })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeDisabled(); expect(view.post).not.toHaveBeenCalled();
  });

  it.each(["ANSWERED", "CANCELLED"] as const)("does not let a previous %s success notice hide Q2", async status => {
    const view = mount(); view.post.mockResolvedValue({ status, submission: status === "ANSWERED" ? own(q1.option_a, 8) : null });
    if (status === "ANSWERED") { await choose(q1, "A"); save(); }
    else fireEvent.click(await screen.findByRole("button", { name: "답변하지 않기" }));
    await waitFor(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
    await view.receive([q2]);
    await screen.findByText(q2.question);
    expect(screen.queryByText(/답변을 새 입력으로 저장|답변하지 않은 조건은 확정하지/)).not.toBeInTheDocument();
    await choose(q2, "B"); expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled();
    expect(view.post).toHaveBeenCalledTimes(1); expect(view.analyze).not.toHaveBeenCalled();
  });

  it("clears Q1's 409 block for Q2 and gives Q2 a new operation UUID and source revision", async () => {
    const view = mount(); view.post.mockRejectedValueOnce(new ApiError(409, { detail: "첫 질문의 원문 변경" }));
    await choose(q1, "A"); save(); await screen.findByRole("alert");
    const firstRequest = view.post.mock.calls[0]?.[2].request_id;
    await view.receive([q2]); await screen.findByText(q2.question);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await choose(q2, "B"); expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled(); save();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(2));
    expect(view.post.mock.calls[1]?.[0]).toBe(code); expect(view.post.mock.calls[1]?.[1]).toBe(q2.question_id);
    expect(view.post.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ expected_revision: q2.source_revision, choice: "B" }));
    expect(view.post.mock.calls[1]?.[2].request_id).not.toBe(firstRequest);
  });

  it("starts the same source question fresh in a new editing round after the previous round's 409", async () => {
    const view = mount(); view.post.mockRejectedValueOnce(new ApiError(409, { detail: "이전 수정 라운드 종료" }));
    await choose(q1, "A"); save(); await screen.findByRole("alert");
    const firstRequest = view.post.mock.calls[0]?.[2].request_id;
    const nextRound = "77777777-7777-4777-8777-777777777777";
    await act(async () => view.rerenderRoom({ ...room, state_version: 12, revision_generation: 2, revision_round: { id: nextRound, generation: 2, status: "OPEN" } }));
    await waitFor(() => expect(view.get.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: q1.option_a })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeDisabled();
    await choose(q1, "A"); expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled(); save();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(2));
    expect(view.post.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ expected_revision: q1.source_revision, revision_round_id: nextRound, choice: "A" }));
    expect(view.post.mock.calls[1]?.[2].request_id).not.toBe(firstRequest);
  });

  it.each(["SUCCESS", "DENIAL"] as const)("ignores Q1's late %s after Q2 has its own direct draft", async outcome => {
    const view = mount(); const pending = deferred<ClarificationAnswerResult>(); view.post.mockReturnValueOnce(pending.promise);
    await choose(q1, "A"); save(); await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    await view.receive([q2]); await screen.findByText(q2.question);
    expect(screen.getByRole("radio", { name: "직접 입력" })).toBeEnabled();
    const text = "새 원문에 대한 본인만의 직접 답변"; await direct(text);
    await act(async () => { if (outcome === "SUCCESS") pending.resolve({ status: "ANSWERED", submission: own(q1.option_a, 8) }); else pending.reject(new ApiError(403, { detail: "이전 질문 요청의 지연 거부" })); });
    expect(screen.queryByText(q2.question)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled();
    expect(view.onSaved).not.toHaveBeenCalled(); expect(view.onAccessDenied).not.toHaveBeenCalled();
    const stored = view.client.getQueryCache().getAll().filter(query => query.queryKey[0] === "clarifications" && query.queryKey[1] === code).map(query => query.state.data as ClarificationList | undefined);
    expect(stored).toContainEqual(expect.objectContaining({ questions: [q2] }));
    expect(view.analyze).not.toHaveBeenCalled();
  });

  it("discards Q1 intent across Q1→none→Q2 and ignores Q1's still pending success", async () => {
    const view = mount(); const pending = deferred<ClarificationAnswerResult>(); view.post.mockReturnValueOnce(pending.promise);
    await direct("이전 질문에서 저장을 요청한 전체 조건"); save();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    await view.receive([]); await waitFor(() => expect(screen.queryAllByRole("radio")).toHaveLength(0));
    await view.receive([q2], 13); await screen.findByText(q2.question);
    expect(screen.getByRole("radio", { name: "직접 입력" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeDisabled();
    await choose(q2, "B"); expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled();
    await act(async () => pending.resolve({ status: "ANSWERED", submission: own(q1.option_a, 8) }));
    expect(screen.queryByText(q2.question)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: q2.option_b })).toBeChecked();
    expect(view.onSaved).not.toHaveBeenCalled(); expect(view.onAccessDenied).not.toHaveBeenCalled();
  });
});
