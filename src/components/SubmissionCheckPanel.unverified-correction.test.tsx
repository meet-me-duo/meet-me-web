import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
it("EX-ORIGINAL a post-close unverified correction shows its frozen input without old clarification evidence", async () => {
  const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "수정본과 최초 질문 근거 구분", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-11-01", search_end_date: "2026-11-15", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: true, collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-11-01T04:00:00Z", public_status: "READY_WITH_WARNINGS", state_version: 10, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V2" };
  const revised = "수정한 원문: 금요일 오후 6시부터 8시까지 가능";
  const old = "첫 원문: 목요일 7시 가능";
  const at = "2026-11-01T03:00:00Z";
  const evidence = { protocol: "PRE_SUBMIT_V2", original_revision: 1, reference_at: at, interpretation: "UNRESOLVED" as const, unresolved_reason: "POST_CLOSE_REVISION", supplement: null };
  const value: SubmissionCheckSnapshot = { candidate: { revision: 2, raw_text: old, created_at: at, interpretation_reference_at: at, evidence: { ...evidence, supplement: { question_id: "33333333-3333-4333-8333-333333333333", source_revision: 1, source_excerpt: "7시", source_start_code_point: 11, prompt: "오래된 질문", answer_text: "오래된 보완 답변", choice_id: "A", answered_at: at, reference_at: at } } }, accepted: { revision: 2, raw_text: revised, created_at: "2026-11-01T05:00:00Z", interpretation_reference_at: "2026-11-01T05:00:00Z", confirmation_source: "UNVERIFIED_CORRECTION", evidence }, check: { id: "22222222-2222-4222-8222-222222222222", status: "CLEAR", version: 5, question: null, retry_allowed: false, failure_code: null }, submission_complete: false, applied_to_result: true, room: { collection_status: "CLOSED", state_version: 10, submission_deadline: null }, operation_outcome: null };
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(value);
  const start = vi.spyOn(api, "startSubmissionCheck"); const answer = vi.spyOn(api, "answerSubmissionCheck");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  await screen.findByText(revised, { exact: true });
  expect(screen.queryByText(old, { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("오래된 보완 답변", { exact: true })).not.toBeInTheDocument();
  expect(document.body).toHaveTextContent(/해석 미확정.*수정/);
  expect(document.body).not.toHaveTextContent(/이번 수정은.*반영되지 않았/);
  expect(screen.queryByText("제출 완료 · 다른 참여자를 기다려 주세요.")).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled(); expect(answer).not.toHaveBeenCalled();
});
