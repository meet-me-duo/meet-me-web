import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { api } from "../api/client";
import type { Room } from "../api/types";

vi.mock("./session", () => ({
  getSession: () => null, getSessionVersion: () => 0, getAccessToken: () => null,
  subscribeSession: () => () => {}, restoreSession: async () => null, endSession: async () => {},
}));
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); localStorage.clear(); });

it("#109 requires legacy guest HOST login before exposing host commands", async () => {
  const room: Room = {
    invite_code: "abcdefghijklmnopqrstuv", purpose: "기존 익명 주최 방", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "DEFAULTED",
    expected_participants: null, submission_deadline: null, manual_only: true,
    collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING",
    viewer: { joined: true, display_name: "기존 게스트 주최자", role: "HOST" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  };
  vi.spyOn(api, "getRoom").mockResolvedValue(room);
  vi.spyOn(api, "getSubmission").mockResolvedValue({ raw_text: "기존 본인 입력", revision: 1, locale: "ko-KR", created_at: "2026-10-17T00:00:00Z", editable: true });
  const close = vi.spyOn(api, "closeRoom");
  const retry = vi.spyOn(api, "retryAnalysis");
  const confirm = vi.spyOn(api, "confirmCandidate");
  const claim = vi.spyOn(api, "claimGuestRoom");
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><App /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole("link", { name: "Google로 로그인" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Kakao로 로그인" })).toBeInTheDocument();
  // Flush already resolved public/own-read promises so a delayed host command cannot hide behind loading UI.
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole("button", { name: "입력 마감하기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /분석 다시 요청|이 일정으로 확정|이 후보로 확정/ })).not.toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(claim).not.toHaveBeenCalled();
});
