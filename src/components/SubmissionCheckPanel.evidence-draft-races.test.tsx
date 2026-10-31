import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// Independent EX-ORIGINAL: an original draft and a scoped answer never change roles implicitly.
const room: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "원문과 보완 답변 경합", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-11-01", search_end_date: "2026-11-15", search_range_source: "HOST_SPECIFIED", expected_participants: 4,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null, closed_at: null,
  public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V2",
};
const original = "토요일 7시 온라인만 가능, 일요일은 불가";
const time = "2026-11-01T03:00:00Z";
const checkId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";
const dirtyAnswer = "제 개인 답변은 퇴근 뒤입니다";
const dirtyOriginal = "다음 주 금요일 19시부터 21시 온라인 가능";
function snapshot(status: "NEEDS_CHOICE" | "CHECKING" | "RECEIVED", raw = original, revision = 1): SubmissionCheckSnapshot {
  const evidence = { protocol: "PRE_SUBMIT_V2" as const, original_revision: 1, reference_at: time, supplement: null, interpretation: "PENDING" as const, unresolved_reason: null };
  return {
    candidate: { revision, raw_text: raw, created_at: time, interpretation_reference_at: time, evidence }, accepted: null,
    check: { id: checkId, status, version: revision + 1, retry_allowed: false, failure_code: null, question: status === "NEEDS_CHOICE" ? {
      id: questionId, text: "7시는 오전인가요, 오후인가요?", source_excerpt: "7시", answer_mode: "CHOICE_OR_TEXT",
      options: [{ id: "A", text: "오전", proposed_text: "오전" }, { id: "B", text: "오후", proposed_text: "오후" }],
    } : null },
    submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: revision, submission_deadline: null }, operation_outcome: null,
  };
}
const clients: QueryClient[] = [];
function setup(initial: SubmissionCheckSnapshot) {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const read = vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(initial);
  const start = vi.spyOn(api, "startSubmissionCheck").mockResolvedValue(snapshot("CHECKING", original, 3));
  const answer = vi.spyOn(api, "answerSubmissionCheck").mockResolvedValue(snapshot("CHECKING", original, 2));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  return { read, start, answer, client };
}
function assertAnswerIsNotAnOriginalDraft() {
  const originalEditor = screen.queryByRole("textbox", { name: /시간·장소 조건/ });
  if (originalEditor) expect(originalEditor).not.toHaveValue(dirtyAnswer);
  expect(screen.queryByDisplayValue(dirtyAnswer) ?? screen.queryByText(dirtyAnswer, { exact: true })).not.toBeNull();
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

it("EX-DRAFT a dirty answer cannot become a new original after selecting A or B", async () => {
  const view = setup(snapshot("NEEDS_CHOICE"));
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));
  fireEvent.change(screen.getByRole("textbox", { name: /보완 답변/ }), { target: { value: dirtyAnswer } });
  fireEvent.click(screen.getByRole("button", { name: "오후" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 답변 제출" }));
  await waitFor(() => expect(view.answer).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "7시는 오전인가요, 오후인가요?" })).not.toBeInTheDocument());

  assertAnswerIsNotAnOriginalDraft();
  expect(view.start).not.toHaveBeenCalled();
});

it("EX-DRAFT a remote question resolution cannot turn a dirty answer into a new original", async () => {
  const view = setup(snapshot("NEEDS_CHOICE"));
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));
  fireEvent.change(screen.getByRole("textbox", { name: /보완 답변/ }), { target: { value: dirtyAnswer } });
  view.read.mockResolvedValue(snapshot("RECEIVED", original, 2));
  await act(async () => { await view.client.invalidateQueries(); });
  await screen.findByRole("heading", { name: "저장된 원문 #2" });

  assertAnswerIsNotAnOriginalDraft();
  expect(view.start).not.toHaveBeenCalled();
  expect(view.answer).not.toHaveBeenCalled();
});

it("EX-DRAFT a dirty original stays separate when a new question opens a direct answer editor", async () => {
  const view = setup(snapshot("CHECKING"));
  fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
  fireEvent.change(screen.getByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: dirtyOriginal } });
  view.read.mockResolvedValue(snapshot("NEEDS_CHOICE"));
  await act(async () => { await view.client.invalidateQueries(); });
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));

  expect(screen.getByRole("textbox", { name: /보완 답변/ })).not.toHaveValue(dirtyOriginal);
  expect(screen.queryByDisplayValue(dirtyOriginal) ?? screen.queryByText(dirtyOriginal, { exact: true })).not.toBeNull();
  expect(view.start).not.toHaveBeenCalled();
  expect(view.answer).not.toHaveBeenCalled();
});

it("EX-LIMIT original plus answer cannot exceed 500 Unicode codepoints", async () => {
  const view = setup(snapshot("NEEDS_CHOICE", "가".repeat(498) + "7시"));
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));
  fireEvent.change(screen.getByRole("textbox", { name: /보완 답변/ }), { target: { value: "🙂" } });

  expect(screen.getByRole("button", { name: "답변 제출" })).toBeDisabled();
  expect(view.answer).not.toHaveBeenCalled();
});

it("EX-LIMIT a one-codepoint emoji answer fits when the original has 499 codepoints", async () => {
  const view = setup(snapshot("NEEDS_CHOICE", "가".repeat(497) + "7시"));
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));
  fireEvent.change(screen.getByRole("textbox", { name: /보완 답변/ }), { target: { value: "🙂" } });
  const submit = screen.getByRole("button", { name: "답변 제출" });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(view.answer).toHaveBeenCalledTimes(1));
  expect(view.start).not.toHaveBeenCalled();
});
