import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import type { Candidate, Room } from "../../api/types";
import RoomPage from "../../pages/RoomPage";
import { mockRoomAccount } from "../../test/roomAccountFixture";
import { reviewApi } from "./api";

const room: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "합성 리뷰 연결", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-28", search_end_date: "2026-11-01", search_range_source: "DEFAULTED",
  expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS",
  closed_at: "2026-10-28T09:00:00Z", public_status: "CONFIRMED", viewer: { joined: true, role: "MEMBER", display_name: "합성 참여자" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", review_prompt_supported: true,
};
const candidate: Candidate = { candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", rank: 1, meeting_mode: "REMOTE", attendance_count: 2, total_participants: 2, place: null, summary: "합성 일정", time_ranges: [{ start_at: "2026-10-30T09:00:00Z", end_at: "2026-10-30T10:00:00Z" }] };
function result(selection = false): Awaited<ReturnType<typeof api.getResult>> {
  return { candidate, confirmed_at: "2026-10-28T09:01:00Z", ...(selection ? { selection: {
    protocol: "diverse-time-v1", analysis_id: "11111111-2222-4333-8444-555555555555", option_id: "22222222-2222-4222-8222-222222222222",
    variant_id: "33333333-3333-4333-8333-333333333333", start_at: "2026-10-30T09:00:00Z", end_at: "2026-10-30T10:00:00Z",
  } } : {}) };
}
beforeEach(() => {
  vi.spyOn(api, "getSubmission").mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" }));
  vi.spyOn(reviewApi, "claim").mockResolvedValue({ prompt_id: "synthetic", state: "PENDING" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mount(view: Room) {
  mockRoomAccount(view); vi.spyOn(api, "getRoom").mockResolvedValue(view);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe("review result integration", () => {
  it.each(["HOST", "MEMBER"] as const)("asks %s only after its confirmed result loads", async role => {
    let complete!: (value: Awaited<ReturnType<typeof api.getResult>>) => void;
    vi.spyOn(api, "getResult").mockReturnValue(new Promise(resolve => { complete = resolve; }));
    mount({ ...room, viewer: { ...room.viewer, role } });
    await screen.findByRole("heading", { name: "선택한 플랜을 불러오는 중이에요" });
    expect(reviewApi.claim).not.toHaveBeenCalled();
    complete({ candidate, confirmed_at: "2026-10-28T09:01:00Z" });
    await screen.findByRole("dialog");
    expect(reviewApi.claim).toHaveBeenCalledTimes(1);
  });
  it("does not ask when confirmed result access fails", async () => {
    vi.spyOn(api, "getResult").mockRejectedValue(new ApiError(503, { detail: "합성 일시 실패" }));
    mount(room);
    await screen.findByRole("heading", { name: "결과를 불러오지 못했어요" });
    expect(reviewApi.claim).not.toHaveBeenCalled();
  });
  it("does not ask before confirmation", async () => {
    mount({ ...room, public_status: "INSUFFICIENT_PARTICIPANTS" });
    await waitFor(() => expect(api.getRoom).toHaveBeenCalled());
    expect(reviewApi.claim).not.toHaveBeenCalled();
  });

  for (const selection of [false, true]) {
    it(`supports literal true on the ${selection ? "explicit time" : "legacy plan"} result`, async () => {
      vi.spyOn(api, "getResult").mockResolvedValue(result(selection)); mount(room);
      await screen.findByRole("dialog"); expect(reviewApi.claim).toHaveBeenCalledTimes(1);
    });
    it.each([
      { label: "missing", value: undefined }, { label: "false", value: false }, { label: "string", value: "true" },
      { label: "number", value: 1 }, { label: "null", value: null }, { label: "object", value: { enabled: true } }, { label: "array", value: [true] },
    ])(`does not mount or claim on ${selection ? "explicit time" : "legacy plan"} when support is $label`, async ({ value }) => {
      vi.spyOn(api, "getResult").mockResolvedValue(result(selection));
      const oldRoom = { ...room }; delete oldRoom.review_prompt_supported;
      if (value !== undefined) Object.assign(oldRoom, { review_prompt_supported: value });
      mount(oldRoom);
      await screen.findByRole("heading", { name: selection ? "실제 모임 일정이 확정됐어요" : "주최자가 선택한 플랜이에요" });
      expect(reviewApi.claim).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  }
});
