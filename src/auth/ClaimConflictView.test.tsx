import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { api } from "../api/client";
import type { Room } from "../api/types";

const session = vi.hoisted(() => ({
  accessToken: "synthetic-access", expiresAt: new Date(Date.now() + 900_000).toISOString(),
  account: { id: "11111111-1111-4111-8111-111111111111", displayName: "로그인 회원" },
}));
vi.mock("./session", () => ({
  getSession: () => session, getSessionVersion: () => 0, getAccessToken: () => session.accessToken,
  subscribeSession: () => () => {}, restoreSession: async () => session.account, endSession: async () => {},
}));
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); localStorage.clear(); });

it("preserves the account member and saved input without exposing a guest-claim action", async () => {
  const room: Room = {
    invite_code: "abcdefghijklmnopqrstuv", purpose: "계정 참여가 있는 모임", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "DEFAULTED",
    expected_participants: null, submission_deadline: null, manual_only: true,
    collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING",
    viewer: { joined: true, display_name: "기존 회원 참여 이름", role: "MEMBER", context_id: "22222222-2222-4222-8222-222222222222" },
    input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  };
  vi.spyOn(api, "getRoom").mockResolvedValue(room);
  vi.spyOn(api, "getSubmission").mockResolvedValue({ raw_text: "계정의 기존 입력", revision: 1, locale: "ko-KR", created_at: "2026-10-17T00:00:00Z", editable: true });
  const claim = vi.spyOn(api, "claimGuestRoom");
  const join = vi.spyOn(api, "joinRoom");
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><App /></MemoryRouter></QueryClientProvider>);

  await screen.findByText("기존 회원 참여 이름님이 참여한 모임");
  expect(claim).not.toHaveBeenCalled();
  expect(screen.queryByText("이 브라우저의 이전 참여 연결")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /참여.*연결/ })).not.toBeInTheDocument();
  expect(join).not.toHaveBeenCalled();
  expect(client.getQueryData<Room>(["room", room.invite_code])?.viewer).toEqual(room.viewer);
  expect(screen.getByText("기존 회원 참여 이름님이 참여한 모임")).toBeInTheDocument();
  expect(screen.queryByText("이 계정에 기존 참여를 연결했어요.")).not.toBeInTheDocument();
});
