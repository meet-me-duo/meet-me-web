// Independent public copy/accessibility contract: guidance helps authors supply an
// AM/PM or 24-hour time. Merely showing it never saves or interprets their text.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { MeetingMode, Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";
import { mockRoomAccount } from "../test/roomAccountFixture";

const code = "abcdefghijklmnopqrstuv";
const round = "11111111-1111-4111-8111-111111111111";
const context = "22222222-2222-4222-8222-222222222222";
const guidance = /시간은 오전·오후를 함께 적어 주세요/;
const samples: Record<MeetingMode, string> = {
  REMOTE: "내일 오후 7~8시, 비대면으로 가능해요",
  IN_PERSON: "내일 오후 7~8시, 강남 근처가 좋아요",
  EITHER: "내일 오후 7~8시, 강남 근처가 좋아요",
};
const base: Room = {
  invite_code: code, purpose: "합성 시간 입력 안내", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null,
  public_status: "COLLECTING", viewer: { joined: true, display_name: "합성 본인", role: "HOST", context_id: context }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};
const stored: Submission = { raw_text: "내일 오후 6~7시 가능", revision: 7, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" };
const clients: QueryClient[] = [];
const cases = (["REMOTE", "IN_PERSON", "EITHER"] as const).flatMap(mode => (["HOST", "MEMBER"] as const).map(role => ({ mode, role })));
function mount(mode: MeetingMode, role: "HOST" | "MEMBER", correcting: boolean) {
  const snapshot: Room = { ...base, meeting_mode: mode, viewer: { ...base.viewer, role }, ...(correcting ? {
    collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z", state_version: 11,
    revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" },
    capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: role === "HOST", can_confirm: false, can_force_reparse: false },
  } as Partial<Room> : {}) };
  mockRoomAccount(snapshot);
  const roomRead = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  const submissionRead = vi.spyOn(api, "getSubmission");
  if (correcting) submissionRead.mockResolvedValue(stored); else submissionRead.mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" }));
  const save = vi.spyOn(api, "saveSubmission"); const analyze = vi.spyOn(api, "analyzeRevision"); const retry = vi.spyOn(api, "retryAnalysis");
  const questions = vi.spyOn(api, "getClarifications");
  const unexpectedFetch = vi.fn().mockRejectedValue(new Error("Unexpected network request for static guidance")); vi.stubGlobal("fetch", unexpectedFetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { roomRead, submissionRead, save, analyze, retry, questions, unexpectedFetch };
}
function assertGuidance(input: HTMLElement, mode: MeetingMode) {
  expect(screen.getByText(guidance)).toBeVisible();
  expect(input).toHaveAttribute("placeholder", expect.stringContaining(samples[mode]));
  expect(input).toHaveAccessibleDescription(guidance);
  expect(input).toHaveAccessibleDescription(/19~20시/);
  fireEvent.change(input, { target: { value: "내일 7-8시쯤" } });
  expect(input).toHaveValue("내일 7-8시쯤");
  expect(screen.getByText(guidance)).toBeVisible();
  expect(input).toHaveAccessibleDescription(guidance);
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#107 time guidance in own initial and correction editors", () => {
  it.each(cases)("keeps visible AM/PM and 24-hour guidance plus an appropriate example for initial $role/$mode", async ({ mode, role }) => {
    const mock = mount(mode, role, false); const input = await screen.findByRole("textbox");
    assertGuidance(input, mode);
    expect(mock.save).not.toHaveBeenCalled(); expect(mock.analyze).not.toHaveBeenCalled(); expect(mock.retry).not.toHaveBeenCalled();
    expect(mock.questions).not.toHaveBeenCalled(); expect(mock.unexpectedFetch).not.toHaveBeenCalled();
    expect(mock.roomRead).toHaveBeenCalledTimes(1); expect(mock.submissionRead).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("keeps the same guidance available while editing saved input in an OPEN round for $role/$mode", async ({ mode, role }) => {
    const mock = mount(mode, role, true); fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    const input = screen.getByRole("textbox"); expect(input).toHaveValue(stored.raw_text); assertGuidance(input, mode);
    expect(mock.save).not.toHaveBeenCalled(); expect(mock.analyze).not.toHaveBeenCalled(); expect(mock.retry).not.toHaveBeenCalled();
    expect(mock.questions).not.toHaveBeenCalled(); expect(mock.unexpectedFetch).not.toHaveBeenCalled();
    expect(mock.roomRead).toHaveBeenCalledTimes(1); expect(mock.submissionRead).toHaveBeenCalledTimes(1);
  });
});
