import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot, SubmissionCheckStatus } from "../api/precheck";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// Approved post-correction provenance: accepted.confirmation_source is the
// server's explicit authority. Candidate/accepted revision numbers belong to
// different histories, and equal text or a historical check status prove nothing.
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
it.each(["CLEAR", "CLOSED_BEFORE_COMPLETION"] as const)("#107 shows a LEGACY_CORRECTION accepted result despite historical %s precheck", async status => {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "수정 분석 완료본과 검사 이력 구분", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z", public_status: "NO_MATCH", state_version: 20, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
  const acceptedRaw = status === "CLEAR" ? "실제 수정 분석에 적용된 최신 조건" : "같은 문자열을 다시 저장한 조건";
  const candidateRaw = status === "CLEAR" ? "오래된 최초 검사 원문" : acceptedRaw;
  const accepted = { revision: 1, raw_text: acceptedRaw, created_at: "2026-10-18T10:00:00Z", interpretation_reference_at: "2026-10-18T10:00:00Z", confirmation_source: "LEGACY_CORRECTION" as const };
  const snapshot: SubmissionCheckSnapshot = { candidate: { revision: 100, raw_text: candidateRaw, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" }, accepted,
    check: { id: "22222222-2222-4222-8222-222222222222", status: status as SubmissionCheckStatus, version: 2, retry_allowed: false, failure_code: null, question: null }, submission_complete: false, applied_to_result: true,
    room: { collection_status: "CLOSED", state_version: 20, submission_deadline: null }, operation_outcome: null };
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(snapshot);
  const start = vi.spyOn(api, "startSubmissionCheck"); const answer = vi.spyOn(api, "answerSubmissionCheck");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  await screen.findAllByText(acceptedRaw);
  expect(document.body).toHaveTextContent(/반영된|반영했|반영하고|반영해|적용된|수정.*저장한.*조건|수정.*반영/);
  expect(document.body).not.toHaveTextContent(/이번 결과에 반영되지 않았|이번 결과에 반영되지 않아요|이번 결과에 반영되지 않은 입력/);
  expect(start).not.toHaveBeenCalled(); expect(answer).not.toHaveBeenCalled();
});
