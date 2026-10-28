import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { api } from "../api/client";
import type { Room } from "../api/types";

const session = vi.hoisted(() => ({
  accessToken: "synthetic-access", expiresAt: new Date(Date.now() + 900_000).toISOString(),
  account: { id: "11111111-1111-4111-8111-111111111111", displayName: "계정 주최자" },
}));
vi.mock("./session", () => ({
  getSession: () => session, getSessionVersion: () => 0, getAccessToken: () => session.accessToken,
  subscribeSession: () => () => {}, restoreSession: async () => session.account, endSession: async () => {},
}));

let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); localStorage.clear(); });

it("#109 explicitly connects an existing closed guest HOST after login and then finds it in the account archive", async () => {
  const room: Room = {
    invite_code: "abcdefghijklmnopqrstuv", purpose: "이전 게스트 모임", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "DEFAULTED",
    expected_participants: null, submission_deadline: null, manual_only: true,
    collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z",
    public_status: "INSUFFICIENT_PARTICIPANTS", viewer: { joined: false, display_name: null, role: null },
    input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  };
  const claimed: Room = { ...room, viewer: { joined: true, display_name: "이전 주최자 이름", role: "HOST" } };
  vi.spyOn(api, "getRoom").mockResolvedValue(room);
  const claim = vi.spyOn(api, "claimGuestRoom").mockResolvedValue(claimed);
  const join = vi.spyOn(api, "joinRoom");
  vi.spyOn(api, "getAccountRooms").mockResolvedValue({ rooms: [{
    invite_code: room.invite_code, purpose: room.purpose,
    created_at: "2026-10-16T10:00:00Z", expires_at: "2026-11-16T10:00:00Z",
  }] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><App /></MemoryRouter></QueryClientProvider>);

  const connect = await screen.findByRole("button", { name: "이 브라우저의 기존 참여 연결" });
  expect(claim).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "모임 참여하기" })).not.toBeInTheDocument();
  fireEvent.click(connect);
  await screen.findByRole("heading", { name: room.purpose });
  expect(screen.getByText("내가 만든 모임", { selector: ".room-kicker" })).toBeInTheDocument();
  expect(claim).toHaveBeenCalledExactlyOnceWith(room.invite_code);
  expect(join).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("link", { name: "내 모임" }));
  expect(await screen.findByRole("link", { name: room.purpose })).toHaveAttribute("href", `/rooms/${room.invite_code}`);
  expect(screen.getByText(/정리 예정/)).toBeInTheDocument();
});
