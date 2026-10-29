import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "마감 전 최종 확인", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "주최자", role: "HOST", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
const empty: SubmissionCheckSnapshot = { candidate: null, accepted: null, check: null, submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null };
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
function mount(snapshot = empty, target = room) {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(snapshot);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SubmissionCheckPanel room={target} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
}

it("keeps raw input on cancel and sends one explicitly confirmed close request", async () => {
  let finishClose!: (value: Room) => void;
  const pending = new Promise<Room>(resolve => { finishClose = resolve; });
  const close = vi.spyOn(api, "closeRoom").mockReturnValue(pending);
  mount();
  const input = await screen.findByRole("textbox", { name: /시간·장소 조건/ });
  fireEvent.change(input, { target: { value: "아직 저장하지 않은 수요일 오후 조건" } });
  fireEvent.click(screen.getByText("주최자 도구", { selector: "summary" }));
  const trigger = screen.getByRole("button", { name: "입력 마감하기" }); fireEvent.click(trigger);
  let dialog = screen.getByRole("dialog", { name: "지금 입력을 마감할까요?" });
  expect(close).not.toHaveBeenCalled(); expect(dialog).toHaveTextContent("자동 마감 조건 전이라도");
  expect(dialog).toHaveTextContent("저장하지 않은 수정 내용");
  expect(within(dialog).getByRole("button", { name: "돌아가기" })).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  expect(input).toHaveValue("아직 저장하지 않은 수요일 오후 조건"); expect(close).not.toHaveBeenCalled();
  fireEvent.click(trigger); dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" })); expect(close).not.toHaveBeenCalled();
  fireEvent.click(trigger); dialog = screen.getByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "지금 입력 마감" });
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(close.mock.calls).toEqual([[room.invite_code, true]]);
  expect(within(dialog).getAllByRole("button").every(button => button.hasAttribute("disabled"))).toBe(true);
  await act(async () => finishClose({ ...room, collection_status: "CLOSED", public_status: "ANALYZING", state_version: 2, closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z" }));
});

it("shows saved input and places HOST tools below cancellation, without a deadline sidebar", async () => {
  const candidate = { revision: 1, raw_text: "저장한 수요일 오후 조건", created_at: "2026-10-17T09:00:00Z", interpretation_reference_at: "2026-10-17T09:00:00Z" };
  const check = { id: "22222222-2222-4222-8222-222222222222", status: "CHECKING" as const, version: 2, retry_allowed: false, failure_code: null, question: null };
  const cancel = vi.spyOn(api, "cancelSubmissionCheck").mockResolvedValue({ ...empty, candidate, check: { ...check, status: "CANCELLED", version: 3 } });
  const close = vi.spyOn(api, "closeRoom");
  mount({ ...empty, candidate, check });
  await screen.findByRole("heading", { name: "저장된 조건" });
  expect(screen.queryByRole("heading", { name: "가능한 조건을 알려주세요" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "마감 조건" })).not.toBeInTheDocument();
  const stop = screen.getByRole("button", { name: "확인 취소" });
  const tools = screen.getByText("주최자 도구", { selector: "summary" });
  expect(stop.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(stop);
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  expect(cancel).toHaveBeenCalledWith(room.invite_code, check.id, expect.objectContaining({ request_id: expect.any(String), expected_revision: 1, expected_check_version: 2 }));
  await screen.findByText(/확인을 취소했어요/);
  expect(screen.getByText(candidate.raw_text)).toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "내 조건 수정" }));
  expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(candidate.raw_text);
});

it("never exposes a close action to a MEMBER", async () => {
  const close = vi.spyOn(api, "closeRoom"); mount(empty, { ...room, viewer: { ...room.viewer, role: "MEMBER" } });
  await screen.findByRole("textbox", { name: /시간·장소 조건/ });
  expect(screen.queryByRole("button", { name: "입력 마감하기" })).not.toBeInTheDocument();
  expect(screen.queryByText("주최자 도구", { selector: "summary" })).not.toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
});
