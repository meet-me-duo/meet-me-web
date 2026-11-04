import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import { mockRoomAccount } from "../test/roomAccountFixture";
import RoomPage from "./RoomPage";

vi.mock("../components/AnalysisOrb", () => ({ AnalysisOrb: () => null }));

const base: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "제출 집계 합성 모임", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-11-10", search_end_date: "2026-11-17", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "CLOSED",
  closure_reason: "MANUAL", closed_at: "2026-11-04T03:00:00Z", public_status: "ANALYZING",
  submitted_participant_count: 2, state_version: 1,
  viewer: { joined: true, display_name: "합성 참여자", role: "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(room = base, authenticated = room.viewer.role === "HOST") {
  mockRoomAccount({ viewer: { ...room.viewer, role: authenticated ? "HOST" : "MEMBER" } });
  vi.spyOn(api, "getGuestRecords").mockResolvedValue({ records: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

describe("room header submission aggregate", () => {
  it.each(["HOST", "MEMBER"] as const)("uses only the server aggregate for joined %s and keeps meeting mode on its own line", async role => {
    const room = { ...base, viewer: { ...base.viewer, role } };
    const read = vi.spyOn(api, "getRoom").mockResolvedValue(room);
    const ownInput = vi.spyOn(api, "getSubmission");
    const otherInputs = vi.spyOn(api, "getUnappliedInputs");
    mount(room);
    expect(await screen.findByRole("img", { name: "입력 마감 · 목표 4명 중 2명 제출" })).toBeInTheDocument();
    expect(screen.getByText("비대면", { selector: ".room-header-mode" })).toBeInTheDocument();
    expect(screen.getByText(/11월 10일/, { selector: ".room-header-dates" })).not.toHaveTextContent("비대면");
    expect(read).toHaveBeenCalledTimes(1);
    expect(ownInput).not.toHaveBeenCalled(); expect(otherInputs).not.toHaveBeenCalled();
  });
  it("uses the no-target count for a time-only or manual room", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...base, expected_participants: null, submission_deadline: "2026-11-05T12:00:00Z" });
    mount();
    expect(await screen.findByRole("img", { name: "입력 마감 · 2명 제출, 목표 인원 없음" })).toHaveTextContent("2명제출");
  });
  it("keeps the original aggregate during correction rounds", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...base, revision_round: { id: "round", generation: 1, status: "OPEN" } });
    mount();
    expect(await screen.findByRole("img", { name: /목표 4명 중 2명 제출/ })).toBeInTheDocument();
  });
  it("does not infer missing aggregate from the viewer, target, or analyzing state", async () => {
    const legacy = { ...base };
    delete legacy.submitted_participant_count;
    vi.spyOn(api, "getRoom").mockResolvedValue(legacy);
    mount();
    expect(await screen.findByRole("img", { name: "입력 마감 · 제출 인원 확인 불가" })).toHaveTextContent("—집계 미확인");
  });
  it("does not manufacture a zero while the room is loading", async () => {
    vi.spyOn(api, "getRoom").mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByRole("heading", { name: "모임을 불러오는 중이에요" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /제출/ })).not.toBeInTheDocument();
  });
  it("does not show a count after an initial read failure", async () => {
    vi.spyOn(api, "getRoom").mockRejectedValue(new ApiError(503, { detail: "합성 장애" }));
    mount();
    expect(await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /제출/ })).not.toBeInTheDocument();
  });
  it("labels old aggregate on refresh failure, then restores fresh aggregate after recovery", async () => {
    const read = vi.spyOn(api, "getRoom").mockResolvedValue(base);
    const client = mount();
    await screen.findByRole("img", { name: /목표 4명 중 2명 제출/ });
    read.mockRejectedValueOnce(new ApiError(503, { detail: "합성 장애" }));
    await act(() => client.invalidateQueries({ queryKey: ["room", base.invite_code] }));
    expect(await screen.findByRole("img", { name: /마지막 확인한 집계 · 목표 4명 중 2명 제출/ })).toHaveTextContent("마지막 확인");
    const fresh = { ...base, submitted_participant_count: 3 };
    read.mockResolvedValue(fresh);
    await act(() => client.invalidateQueries({ queryKey: ["room", base.invite_code] }));
    await screen.findByRole("img", { name: "입력 마감 · 목표 4명 중 3명 제출" });
    expect(screen.queryByText("마지막 확인", { exact: true })).not.toBeInTheDocument();
  });
  it.each([401, 403, 404])("removes the header and aggregate when access becomes %s", async status => {
    const read = vi.spyOn(api, "getRoom").mockResolvedValue(base);
    const client = mount();
    await screen.findByRole("img", { name: /목표 4명 중 2명 제출/ });
    read.mockRejectedValueOnce(new ApiError(status, { detail: "접근 불가" }));
    await act(() => client.invalidateQueries({ queryKey: ["room", base.invite_code] }));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await waitFor(() => expect(screen.queryByRole("img", { name: /제출/ })).not.toBeInTheDocument());
  });
  it("preserves the existing pre-join privacy boundary", async () => {
    const room = { ...base, viewer: { joined: false, display_name: null, role: null } };
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    const ownInput = vi.spyOn(api, "getSubmission");
    mount(room);
    await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    expect(screen.queryByRole("img", { name: /제출/ })).not.toBeInTheDocument();
    expect(ownInput).not.toHaveBeenCalled();
  });
  it("preserves the login gate for a legacy unauthenticated host", async () => {
    const room = { ...base, viewer: { ...base.viewer, role: "HOST" as const } };
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    mount(room, false);
    await screen.findByRole("img", { name: /목표 4명 중 2명 제출/ });
    expect(screen.getByRole("link", { name: "Google로 로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "입력 마감하기" })).not.toBeInTheDocument();
  });
});
