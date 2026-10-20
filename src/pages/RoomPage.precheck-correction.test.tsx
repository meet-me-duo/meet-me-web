import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api/client";
import type { Room, Submission } from "../api/types";
import * as accountHook from "../auth/useAccount";
import RoomPage from "./RoomPage";

// Parent clarified PS27: CLOSED + an existing OPEN correction round preserves
// its explicit cohort-edit API. Pre-submit must never reopen collection itself.
const code = "abcdefghijklmnopqrstuv";
const roundId = "11111111-1111-4111-8111-111111111111";
const room: Room = {
  invite_code: code, purpose: "신규 protocol의 기존 수정 라운드 보존", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 2,
  submission_deadline: "2026-10-01T00:00:00Z", manual_only: false, collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z", public_status: "COLLECTING", state_version: 11,
  viewer: { joined: true, display_name: "기존 참여자", role: "MEMBER", context_id: roundId }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1",
  revision_generation: 1, revision_round: { id: roundId, generation: 1, status: "OPEN" }, analysis_id: roundId, remaining_correction_analyses: 3,
  capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false },
};
const own: Submission = { revision: 7, raw_text: "이전에 확인 완료한 온라인 조건", editable: true, locale: "ko-KR", created_at: "2026-10-17T09:00:00Z" };
const clients: QueryClient[] = [];
function setup(snapshot = room) {
  vi.spyOn(accountHook, "useAccountSession").mockReturnValue(null);
  vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  const read = vi.spyOn(api, "getSubmission").mockResolvedValue(own);
  const save = vi.spyOn(api, "saveSubmission").mockResolvedValue({ ...own, revision: 8, raw_text: "토요일 오후 온라인 가능" });
  const precheckRead = vi.spyOn(api, "getSubmissionCheck"); const precheckStart = vi.spyOn(api, "startSubmissionCheck"); const join = vi.spyOn(api, "joinRoom");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { read, save, precheckRead, precheckStart, join };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); });
describe("#107 closed correction compatibility", () => {
  it("edits only through the existing round/revision PUT despite the expired collection deadline", async () => {
    const view = setup(); fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: "토요일 오후 온라인 가능" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await waitFor(() => expect(view.save).toHaveBeenCalledWith(code, { raw_text: "토요일 오후 온라인 가능", revision_round_id: roundId, expected_revision: 7 }));
    expect(view.precheckRead).not.toHaveBeenCalled(); expect(view.precheckStart).not.toHaveBeenCalled(); expect(view.join).not.toHaveBeenCalled();
  });

  it("does not grant a joined viewer outside the frozen cohort a new check or editor", async () => {
    const view = setup({ ...room, capabilities: { ...room.capabilities!, can_edit_own_submission: false } });
    await screen.findByText("조건을 수정하는 중이에요");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(view.precheckRead).not.toHaveBeenCalled(); expect(view.precheckStart).not.toHaveBeenCalled();
  });

  it("does not open new participation in DB-CLOSED/public-COLLECTING", async () => {
    const view = setup({ ...room, viewer: { joined: false, role: null, display_name: null }, capabilities: { ...room.capabilities!, can_edit_own_submission: false } });
    await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    expect(screen.queryByRole("button", { name: "참여하기" })).not.toBeInTheDocument(); expect(view.join).not.toHaveBeenCalled(); expect(view.precheckRead).not.toHaveBeenCalled();
  });
});
