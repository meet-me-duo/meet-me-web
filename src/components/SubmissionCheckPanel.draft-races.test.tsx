import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// PS14/PD04: preserve a local draft through public actions after another tab's
// snapshot arrives; an older private view cannot prove final inclusion/exclusion.
const code = "abcdefghijklmnopqrstuv";
const baseRoom: Room = { invite_code: code, purpose: "로컬 초안과 서버 상태 경합", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
function snapshot(raw_text?: string, revision = 1, question = false): SubmissionCheckSnapshot {
  return { candidate: raw_text ? { revision, raw_text, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" } : null, accepted: null,
    check: raw_text ? { id: `22222222-2222-4222-8222-${String(revision).padStart(12, "0")}`, status: question ? "NEEDS_CHOICE" : "CHECKING", version: 1, retry_allowed: false, failure_code: null,
      question: question ? { id: `33333333-3333-4333-8333-${String(revision).padStart(12, "0")}`, text: `질문 ${revision}: 오전인가요 오후인가요?`, source_excerpt: "7시", options: [{ id: "AM", text: "오전", proposed_text: "내일 오전 7시 온라인" }, { id: "PM", text: "오후", proposed_text: "내일 오후 7시 온라인" }] } : null } : null,
    submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null };
}
const clients: QueryClient[] = [];
function setup(initial = snapshot()) {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const read = vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(initial);
  const start = vi.spyOn(api, "startSubmissionCheck"); const answer = vi.spyOn(api, "answerSubmissionCheck");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = (room = baseRoom) => <QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>;
  const view = render(tree()); return { read, start, answer, client, rerenderRoom: (room: Room) => view.rerender(tree(room)) };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

it("#107 keeps dirty local text when the user reopens editing after another tab saves a candidate", async () => {
  const view = setup(); const input = await screen.findByRole("textbox", { name: /시간·장소 조건/ });
  fireEvent.change(input, { target: { value: "이 탭의 소중한 미저장 초안" } });
  view.read.mockResolvedValue(snapshot("다른 탭에서 저장한 원문", 3)); await act(async () => { await view.client.invalidateQueries(); });
  await screen.findByText("다른 탭에서 저장한 원문");
  const reopen = screen.queryByRole("button", { name: "내 조건 수정" }); if (reopen) fireEvent.click(reopen);
  expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue("이 탭의 소중한 미저장 초안");
  expect(view.start).not.toHaveBeenCalled(); expect(view.answer).not.toHaveBeenCalled();
});

it("#107 keeps a direct-edit draft when another tab produces a newer question", async () => {
  const view = setup(snapshot("첫 질문 원문", 1, true)); fireEvent.click(await screen.findByRole("button", { name: "직접 수정" }));
  fireEvent.change(screen.getByRole("textbox", { name: /시간·장소 조건|직접 수정/ }), { target: { value: "직접 고치던 미저장 전체 조건" } });
  view.read.mockResolvedValue(snapshot("다른 탭의 새 질문 원문", 3, true)); await act(async () => { await view.client.invalidateQueries(); });
  await screen.findByText("질문 3: 오전인가요 오후인가요?");
  const direct = screen.queryByRole("button", { name: "직접 수정" }); if (direct) fireEvent.click(direct);
  expect(screen.getByRole("textbox", { name: /시간·장소 조건|직접 수정/ })).toHaveValue("직접 고치던 미저장 전체 조건");
  expect(view.start).not.toHaveBeenCalled(); expect(view.answer).not.toHaveBeenCalled();
});

it("#107 asks to reconcile final inclusion when the room closed after an older private snapshot", async () => {
  const view = setup(snapshot("마감 전 확인중이던 조건")); await screen.findByText("마감 전 확인중이던 조건");
  view.rerenderRoom({ ...baseRoom, collection_status: "CLOSED", public_status: "ANALYZING", state_version: 9, closure_reason: "MANUAL", closed_at: "2026-10-17T10:01:00Z" });
  expect(document.body).not.toHaveTextContent(/이번 결과에 반영되지 않았|이번 결과에 반영되지 않아요|이번 결과에 반영되지 않은 입력/);
  expect(screen.getByRole("button", { name: /반영 여부 확인|최종 상태 확인|현재 상태 확인/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /확인 취소|다시 확인|조건 제출하기/ })).not.toBeInTheDocument();
  expect(view.start).not.toHaveBeenCalled(); expect(view.answer).not.toHaveBeenCalled();
});
