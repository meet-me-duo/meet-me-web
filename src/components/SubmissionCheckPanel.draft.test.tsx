import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// PS14/PD04: previous accepted data must not make a new unsaved draft look done.
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
it("#107 distinguishes an unsaved edit from the prior accepted completion", async () => {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "미저장 초안의 완료 오표시 방지", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
  const prior = { revision: 1, raw_text: "기존 확인 완료 원문", created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" };
  const accepted = { ...prior, confirmation_source: "PRECHECK" as const };
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue({ candidate: prior, accepted, check: { id: "22222222-2222-4222-8222-222222222222", status: "CLEAR", version: 2, retry_allowed: false, failure_code: null, question: null }, submission_complete: true, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null });
  const start = vi.spyOn(api, "startSubmissionCheck");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
  fireEvent.change(screen.getByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: "아직 저장하지 않은 새 조건" } });
  expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue("아직 저장하지 않은 새 조건");
  expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
  expect(document.body).toHaveTextContent(/아직.*저장|미저장|새.*조건.*반영되지/);
  expect(document.body).toHaveTextContent("기존 확인 완료 원문"); expect(start).not.toHaveBeenCalled();
});
