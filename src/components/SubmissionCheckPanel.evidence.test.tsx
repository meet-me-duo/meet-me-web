import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Room } from "../api/types";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// EX-RECEIPT / EX-ORIGINAL / EX-QUESTION-ONCE: public wire fixtures, no backend/model.
const room: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "보완 정보를 보존하는 실험", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-11-01", search_end_date: "2026-11-15", search_range_source: "HOST_SPECIFIED", expected_participants: 4,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null, closed_at: null,
  public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V2",
};
const original = "토요일 7~8시 온라인만 가능, 일요일은 불가";
const time = "2026-11-01T03:00:00Z";
const checkId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";
const question = { id: questionId, text: "7~8시는 오전인가요, 오후인가요?", source_excerpt: "7~8시", options: [
  { id: "A", text: "오전", proposed_text: "오전 7~8시" }, { id: "B", text: "오후", proposed_text: "오후 7~8시" },
] };
const evidence = { protocol: "PRE_SUBMIT_V2", original_revision: 1, reference_at: time, supplement: null, interpretation: "PENDING", unresolved_reason: null };
function snapshot(status: string, overrides: Record<string, unknown> = {}) {
  const candidate = { revision: 1, raw_text: original, created_at: time, interpretation_reference_at: time, evidence };
  return { candidate, accepted: null, check: { id: checkId, status, version: 2, question: status === "NEEDS_CHOICE" ? question : null, retry_allowed: false, failure_code: null },
    submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null, ...overrides };
}
const clients: QueryClient[] = [];
function setup(initial: ReturnType<typeof snapshot>, next?: ReturnType<typeof snapshot>) {
  vi.spyOn(session, "getAccessToken").mockReturnValue(null); vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(initial), { status: 200 });
    writes.push({ path, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(next ?? snapshot("CHECKING", { candidate: { ...initial.candidate, revision: 2 } })), { status: 202 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  return writes;
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

it("EX-RECEIPT shows received unresolved evidence without claiming interpretation confirmed", async () => {
  const supplement = { question_id: questionId, source_revision: 1, source_excerpt: "7~8시", source_start_code_point: 4, prompt: question.text, answer_text: "퇴근하면 가능해요", choice_id: null, answered_at: time, reference_at: time };
  const accepted = { revision: 1, raw_text: original, created_at: time, interpretation_reference_at: time, confirmation_source: "PRECHECK_UNRESOLVED", evidence: { ...evidence, supplement, interpretation: "UNRESOLVED", unresolved_reason: "MATERIAL_AMBIGUITY" } };
  setup(snapshot("RECEIVED", { candidate: { ...snapshot("RECEIVED").candidate, revision: 2, evidence: accepted.evidence }, accepted, submission_complete: true }));
  await screen.findByText(/접수 완료.*최종 분석에서 해석/);
  expect(screen.getByText("퇴근하면 가능해요", { exact: true })).toBeInTheDocument();
  expect(document.querySelector(".submission-privacy")).not.toBeInTheDocument();
  expect(screen.queryByText("제출 완료 · 다른 참여자를 기다려 주세요.")).not.toBeInTheDocument();
  expect(screen.queryByText("수정 확인 중에는 이전 접수본을 유지해요.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "확인 취소" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: question.text })).not.toBeInTheDocument();
});

it("EX-ORIGINAL direct answer is an empty scoped editor and never rewrites the original input", async () => {
  const writes = setup(snapshot("NEEDS_CHOICE", { check: { ...snapshot("NEEDS_CHOICE").check, question: { ...question, options: [] } } }));
  fireEvent.click(await screen.findByRole("button", { name: "직접 답변" }));
  const editor = screen.getByRole("textbox", { name: /보완 답변/ });
  expect(editor).toHaveValue("");
  expect(screen.getByText(original, { exact: true })).toBeInTheDocument();
  fireEvent.change(editor, { target: { value: "  오후 7~8시  " } });
  fireEvent.click(screen.getByRole("button", { name: "답변 제출" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({ path: `/api/rooms/${room.invite_code}/submission/checks/${checkId}/answer`, body: { request_id: expect.any(String), expected_revision: 1, expected_check_version: 2, question_id: questionId, direct_text: "오후 7~8시" } });
  await screen.findByText(/모호한 부분을 확인 중/);
  expect(screen.queryByText(original, { exact: true })).not.toBeInTheDocument();
});

it("EX-ORIGINAL A/B only previews and submits the supplement after explicit confirmation", async () => {
  const writes = setup(snapshot("NEEDS_CHOICE"));
  fireEvent.click(await screen.findByRole("button", { name: "오후" }));
  expect(screen.getByText("오후 7~8시", { exact: true })).toBeInTheDocument();
  expect(screen.getByText(original, { exact: true })).toBeInTheDocument();
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "선택한 답변 제출" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]!.body).toMatchObject({ question_id: questionId, choice_id: "B", expected_revision: 1, expected_check_version: 2 });
  expect(writes[0]!.body).not.toHaveProperty("raw_text");
  expect(writes[0]!.body).not.toHaveProperty("direct_text");
});

it("EX-RECEIPT an unresolved new original after the question cap is not received", async () => {
  const writes = setup(snapshot("UNRESOLVED", { check: { ...snapshot("UNRESOLVED").check, failure_code: "QUESTION_LIMIT_REACHED" } }));
  await screen.findByText(/이미 보완 질문을 한 번 제공해 추가 질문은 없어요/);
  expect(screen.queryByText(/접수 완료/)).not.toBeInTheDocument();
  expect(screen.queryByText("제출 완료 · 다른 참여자를 기다려 주세요.")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: question.text })).not.toBeInTheDocument();
  expect(writes).toHaveLength(0);
});
