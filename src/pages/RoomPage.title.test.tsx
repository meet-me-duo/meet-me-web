import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import { mockRoomAccount } from "../test/roomAccountFixture";
import RoomPage from "./RoomPage";

const codeA = "abcdefghijklmnopqrstuv";
const codeB = "bcdefghijklmnopqrstuvw";
const room: Room = {
  invite_code: codeA, purpose: "가족 모임", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-11-05", search_end_date: "2026-11-12", search_range_source: "DEFAULTED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING",
  viewer: { joined: false, display_name: null, role: null }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.title = ""; });

function mount() {
  mockRoomAccount(room);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${codeA}`]}>
    <Link to={`/rooms/${codeB}`}>다음 모임</Link><Link to="/">홈</Link>
    <Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /><Route path="/" element={<p>홈 화면</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

it("clears previous title during client navigation and missing-room reads, then restores home", async () => {
  let rejectNext!: (reason: Error) => void;
  vi.spyOn(api, "getRoom").mockImplementation(code => code === codeA ? Promise.resolve(room) : new Promise((_, reject) => { rejectNext = reject; }));
  mount();
  await waitFor(() => expect(document.title).toBe("Meet me - 가족 모임"));
  fireEvent.click(screen.getByRole("link", { name: "다음 모임" }));
  await waitFor(() => expect(document.title).toBe("Meet me — 스마트 일정 조율"));
  await act(async () => { rejectNext(new ApiError(404, { detail: "없는 모임" })); });
  expect(document.title).toBe("Meet me — 스마트 일정 조율");
  fireEvent.click(screen.getByRole("link", { name: "홈" }));
  expect(document.title).toBe("Meet me — 스마트 일정 조율");
});

it.each([401, 403, 404])("clears a cached room name on access or deletion error %s", async status => {
  const read = vi.spyOn(api, "getRoom").mockResolvedValue(room);
  const client = mount();
  await waitFor(() => expect(document.title).toBe("Meet me - 가족 모임"));
  read.mockRejectedValue(new ApiError(status, { detail: "조회할 수 없는 모임" }));
  await act(async () => { await client.invalidateQueries({ queryKey: ["room", codeA] }); });
  // React Query schedules observer notifications after the fetch promise settles.
  await waitFor(() => expect(document.title).toBe("Meet me — 스마트 일정 조율"));
});

it("shows the second room after successful SPA navigation", async () => {
  vi.spyOn(api, "getRoom").mockImplementation(code => Promise.resolve(code === codeA ? room : { ...room, invite_code: codeB, purpose: "친구 모임" }));
  mount();
  await waitFor(() => expect(document.title).toBe("Meet me - 가족 모임"));
  fireEvent.click(screen.getByRole("link", { name: "다음 모임" }));
  await waitFor(() => expect(document.title).toBe("Meet me - 친구 모임"));
});
