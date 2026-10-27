// Independent #107 UI contract oracle. Production implementation was not read.
// These tests prove mocked UI boundaries, not real model interpretation or HTTP authorization.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { Room, Submission } from "../api/types";
import ClarificationPanel from "./ClarificationPanel";

const code = "abcdefghijklmnopqrstuv";
const round = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const anotherOwner = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const capabilities = { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const room: Room = {
  invite_code: code, purpose: "합성 보완 질문", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
  public_status: "COLLECTING", viewer: { joined: true, display_name: "합성 본인", role: "MEMBER", context_id: owner },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", state_version: 11, revision_generation: 1,
  revision_round: { id: round, generation: 1, status: "OPEN" }, analysis_id: "55555555-5555-4555-8555-555555555555",
  capabilities, remaining_correction_analyses: 3,
};
const question = {
  question_id: questionId, source_revision: 7, excerpt: "내일 7시 가능",
  question: "오전과 오후 중 언제인가요?", option_a: "내일 오전 7시 가능", option_b: "내일 오후 7시 가능", editable: true,
};
const answer: Submission = { raw_text: question.option_b, revision: 8, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:01:00Z" };
const clients: QueryClient[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(snapshot: Room = room) {
  const get = vi.spyOn(api, "getClarifications").mockResolvedValue({ questions: [question], state_version: 11 });
  const post = vi.spyOn(api, "answerClarification").mockResolvedValue({ status: "ANSWERED", submission: answer });
  const analyze = vi.spyOn(api, "analyzeRevision");
  const retryAnalysis = vi.spyOn(api, "retryAnalysis");
  const saveSubmission = vi.spyOn(api, "saveSubmission");
  const onSaved = vi.fn(); const onAccessDenied = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  const props = { room: snapshot, onSaved, onAccessDenied };
  const view = render(<QueryClientProvider client={client}><ClarificationPanel {...props} /></QueryClientProvider>);
  const rerender = (nextRoom: Room) => view.rerender(<QueryClientProvider client={client}><ClarificationPanel {...props} room={nextRoom} /></QueryClientProvider>);
  return { ...view, get, post, analyze, retryAnalysis, saveSubmission, client, onSaved, onAccessDenied, rerender };
}
async function selectB() { fireEvent.click(await screen.findByRole("radio", { name: question.option_b })); }
async function direct(text: string) {
  fireEvent.click(await screen.findByRole("radio", { name: "직접 입력" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "답변 저장" })); }
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

describe("#107 owner-scoped clarification presentation", () => {
  it("shows only server-returned own excerpt and choices without choosing or calling AI automatically", async () => {
    const view = mount();
    await screen.findByText(question.question);
    expect(screen.getByText(question.excerpt)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: question.option_a })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: question.option_b })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeDisabled();
    expect(view.get).toHaveBeenCalledWith(code, expect.any(AbortSignal));
    expect(view.post).not.toHaveBeenCalled();
    expect(view.analyze).not.toHaveBeenCalled(); expect(view.retryAnalysis).not.toHaveBeenCalled(); expect(view.saveSubmission).not.toHaveBeenCalled();
  });

  it("hides the panel for an empty persisted question set (clear inputs and unanswered results are not fabricated)", async () => {
    const view = mount();
    // An initial query without data deduplicates invalidation into its pending promise.
    await screen.findByText(question.question);
    view.get.mockResolvedValue({ questions: [], state_version: 11 });
    await view.client.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "답변 저장" })).not.toBeInTheDocument();
    expect(view.post).not.toHaveBeenCalled(); expect(view.analyze).not.toHaveBeenCalled();
  });

  it.each(["A", "B"] as const)("saves explicit %s with the exact source revision and current correction round", async choice => {
    const view = mount();
    fireEvent.click(await screen.findByRole("radio", { name: choice === "A" ? question.option_a : question.option_b }));
    submit();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    expect(view.post).toHaveBeenCalledWith(code, questionId, {
      request_id: expect.stringMatching(uuid), revision_round_id: round, expected_revision: 7, choice,
    });
    await waitFor(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/주최자|HOST/)).toHaveTextContent(/다시 분석|재분석/);
    expect(view.analyze).not.toHaveBeenCalled(); expect(view.retryAnalysis).not.toHaveBeenCalled(); expect(view.saveSubmission).not.toHaveBeenCalled();
  });

  it("leaves an unanswered question unchanged on unmount and reloads the persisted source after refresh", async () => {
    const view = mount(); await selectB(); view.unmount();
    expect(view.post).not.toHaveBeenCalled();
    render(<QueryClientProvider client={view.client}><ClarificationPanel room={room} onSaved={view.onSaved} onAccessDenied={view.onAccessDenied} /></QueryClientProvider>);
    await screen.findByText(question.question);
    expect(screen.getByRole("radio", { name: question.option_b })).not.toBeChecked();
    expect(view.post).not.toHaveBeenCalled(); expect(view.analyze).not.toHaveBeenCalled();
  });

  it.each([
    ["closed round", { revision_round: null }],
    ["consumed round", { revision_round: { id: round, generation: 1, status: "CONSUMED" as const } }],
    ["revoked capability", { capabilities: { ...capabilities, can_edit_own_submission: false } }],
  ])("does not offer answer mutation in %s", async (_name, overrides) => {
    const view = mount({ ...room, ...overrides });
    await screen.findByText(question.question);
    for (const button of screen.queryAllByRole("button")) expect(button).toBeDisabled();
    for (const radio of screen.queryAllByRole("radio")) expect(radio).toBeDisabled();
    expect(view.post).not.toHaveBeenCalled();
  });

  it("respects a server read-only question even inside an editable round", async () => {
    const view = mount();
    await screen.findByText(question.question);
    view.get.mockResolvedValue({ questions: [{ ...question, editable: false }], state_version: 11 });
    await view.client.invalidateQueries();
    await waitFor(() => {
      expect(view.get).toHaveBeenCalledTimes(2);
      for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    });
    expect(view.post).not.toHaveBeenCalled();
  });

  it("cancels explicitly without creating a replacement submission or analyzing", async () => {
    const view = mount(); view.post.mockResolvedValue({ status: "CANCELLED", submission: null });
    fireEvent.click(await screen.findByRole("button", { name: "답변하지 않기" }));
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    expect(view.post).toHaveBeenCalledWith(code, questionId, {
      request_id: expect.stringMatching(uuid), revision_round_id: round, expected_revision: 7, choice: "CANCEL",
    });
    expect(view.saveSubmission).not.toHaveBeenCalled(); expect(view.analyze).not.toHaveBeenCalled();
  });
});

describe("#107 direct replacement validation", () => {
  it.each(["", " \t\n\u00a0\ufeff ", "가".repeat(501), "😀".repeat(501)])("rejects an invalid complete replacement of %i code units", async text => {
    const view = mount(); await direct(text);
    const button = screen.getByRole("button", { name: "답변 저장" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(view.post).not.toHaveBeenCalled();
  });

  it.each(["가", "😀".repeat(500), "\u0085", "내일 오전 7시부터 8시,  강남 선호\n모레는 불가"])("accepts complete Unicode input and preserves its interior (%s)", async text => {
    const view = mount(); await direct(` \ufeff\t${text}\n\u00a0`);
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeEnabled(); submit();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    expect(view.post).toHaveBeenCalledWith(code, questionId, {
      request_id: expect.stringMatching(uuid), revision_round_id: round, expected_revision: 7, choice: "DIRECT", direct_text: text,
    });
  });
});

describe("#107 retry, race and access boundaries", () => {
  it("retains direct input and the exact operation UUID after a transient failure", async () => {
    const view = mount(); view.post.mockRejectedValueOnce(new ApiError(503, { detail: "합성 일시 장애" }));
    const text = "내일 오후 7시부터 9시만 가능"; await direct(text); submit();
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue(text);
    const first = view.post.mock.calls[0]?.[2]; submit();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(2));
    expect(view.post.mock.calls[1]?.[2]).toEqual(first);
    expect(view.analyze).not.toHaveBeenCalled();
  });

  it("uses a new UUID after the failed intent is explicitly changed", async () => {
    const view = mount(); view.post.mockRejectedValueOnce(new ApiError(503, { detail: "합성 일시 장애" }));
    await selectB(); submit(); await screen.findByRole("alert");
    const first = view.post.mock.calls[0]?.[2].request_id;
    fireEvent.click(screen.getByRole("radio", { name: question.option_a })); submit();
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(2));
    expect(view.post.mock.calls[1]?.[2].request_id).not.toBe(first);
  });

  it("blocks immediate double submission and cancellation while saving", async () => {
    const view = mount(); const pending = deferred<Awaited<ReturnType<typeof api.answerClarification>>>();
    view.post.mockReturnValue(pending.promise); await selectB();
    const button = screen.getByRole("button", { name: "답변 저장" }); fireEvent.click(button); fireEvent.click(button);
    expect(view.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "답변하지 않기" })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await act(async () => pending.resolve({ status: "ANSWERED", submission: answer }));
  });

  it("stops stale writes after 409 rather than automatically retrying against a newer source", async () => {
    const view = mount(); view.post.mockRejectedValue(new ApiError(409, { code: "CLARIFICATION_STALE_REVISION", detail: "합성 원문 변경" }));
    await selectB(); submit(); await screen.findByRole("alert");
    const button = screen.queryByRole("button", { name: "답변 저장" });
    if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(view.post).toHaveBeenCalledTimes(1); expect(view.analyze).not.toHaveBeenCalled();
    expect(view.onSaved).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("forwards current-owner GET %i to the access boundary", async status => {
    const view = mount(); const error = new ApiError(status, { detail: "합성 질문 접근 거부" });
    await screen.findByText(question.question);
    view.get.mockRejectedValue(error); await view.client.invalidateQueries();
    await waitFor(() => expect(view.onAccessDenied).toHaveBeenCalledWith(error));
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument();
  });

  it.each([401, 403])("forwards current-owner POST %i and removes the private draft", async status => {
    const view = mount(); const error = new ApiError(status, { detail: "합성 답변 접근 거부" });
    view.post.mockRejectedValue(error); const text = "본인 비공개 임시 원문";
    await direct(text); submit();
    await waitFor(() => expect(view.onAccessDenied).toHaveBeenCalledWith(error));
    expect(screen.queryByDisplayValue(text)).not.toBeInTheDocument();
  });

  it("separates an identical-room question and draft when viewer context changes", async () => {
    const view = mount(); const text = "이전 참여자의 저장하지 않은 사유"; await direct(text);
    const next = { ...question, question_id: "66666666-6666-4666-8666-666666666666", excerpt: "새 참여자 입력", question: "새 참여자 질문", option_a: "새 오전", option_b: "새 오후" };
    view.get.mockResolvedValue({ questions: [next], state_version: 11 });
    view.rerender({ ...room, viewer: { ...room.viewer, context_id: anotherOwner } });
    await screen.findByText(next.question);
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(text)).not.toBeInTheDocument();
    expect(view.client.getQueryData(["clarifications", code, owner])).toBeUndefined();
    expect(view.post).not.toHaveBeenCalled();
  });

  it("does not reuse private questions in a different room", async () => {
    const view = mount(); await screen.findByText(question.question);
    const pending = deferred<Awaited<ReturnType<typeof api.getClarifications>>>(); view.get.mockReturnValue(pending.promise);
    view.rerender({ ...room, invite_code: "zyxwvutsrqponmlkjihgfe" });
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument();
    await act(async () => pending.resolve({ questions: [], state_version: 11 }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("ignores an old viewer's late read even if the transport ignores AbortSignal", async () => {
    const view = mount(); await screen.findByText(question.question);
    const pending = deferred<Awaited<ReturnType<typeof api.getClarifications>>>(); view.get.mockReturnValueOnce(pending.promise);
    const oldRead = view.client.invalidateQueries();
    await waitFor(() => expect(view.get).toHaveBeenCalledTimes(2));
    view.get.mockResolvedValue({ questions: [], state_version: 11 });
    view.rerender({ ...room, viewer: { ...room.viewer, context_id: anotherOwner } });
    await waitFor(() => expect(view.get).toHaveBeenCalledTimes(3));
    await act(async () => { pending.resolve({ questions: [question], state_version: 11 }); await oldRead; });
    expect(screen.queryByText(question.excerpt)).not.toBeInTheDocument();
  });

  it("revokes an already-selected answer as soon as the editing capability changes", async () => {
    const view = mount(); await selectB();
    view.rerender({ ...room, capabilities: { ...capabilities, can_edit_own_submission: false } });
    const button = screen.queryByRole("button", { name: "답변 저장" });
    if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(view.post).not.toHaveBeenCalled();
  });

  it("ignores an old viewer's late successful write without refreshing or modifying the new owner", async () => {
    const view = mount(); const pending = deferred<Awaited<ReturnType<typeof api.answerClarification>>>();
    view.post.mockReturnValue(pending.promise); await selectB(); submit();
    const next = { ...question, question: "새 참여자의 별도 질문", excerpt: "새 참여자의 별도 원문" };
    view.get.mockResolvedValue({ questions: [next], state_version: 11 });
    view.rerender({ ...room, viewer: { ...room.viewer, context_id: anotherOwner } });
    await screen.findByText(next.question);
    await act(async () => pending.resolve({ status: "ANSWERED", submission: answer }));
    expect(view.onSaved).not.toHaveBeenCalled();
    expect(screen.getByText(next.excerpt)).toBeInTheDocument();
    expect(view.onAccessDenied).not.toHaveBeenCalled();
  });

  it("ignores an old viewer's late POST denial rather than clearing the new owner's session", async () => {
    const view = mount(); const pending = deferred<Awaited<ReturnType<typeof api.answerClarification>>>();
    view.post.mockReturnValue(pending.promise); await selectB(); submit();
    const next = { ...question, question: "새 참여자 질문", excerpt: "새 참여자 원문" };
    view.get.mockResolvedValue({ questions: [next], state_version: 11 });
    view.rerender({ ...room, viewer: { ...room.viewer, context_id: anotherOwner } });
    await screen.findByText(next.question);
    await act(async () => pending.reject(new ApiError(403, { detail: "이전 참여자의 지연 권한 거부" })));
    expect(view.onAccessDenied).not.toHaveBeenCalled();
    expect(screen.getByText(next.excerpt)).toBeInTheDocument();
    expect(view.onSaved).not.toHaveBeenCalled();
  });
});
