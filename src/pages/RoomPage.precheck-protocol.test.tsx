import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import * as accountHook from "../auth/useAccount";
import RoomPage from "./RoomPage";

// PS28: a future protocol is intentional unknown wire data. It must not silently
// downgrade to the LEGACY writer or read a private record through the wrong API.
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); localStorage.clear(); });
it("#107 rejects an unsupported submission protocol before private reads/writes", async () => {
  const code = "abcdefghijklmnopqrstuv";
  const futureWireRoom = { invite_code: code, purpose: "미래 프로토콜 모임", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V999" };
  // Explicitly exercise unknown JSON beyond the current generated enum.
  vi.spyOn(api, "getRoom").mockResolvedValue(futureWireRoom as unknown as Room);
  vi.spyOn(accountHook, "useAccountSession").mockReturnValue(null);
  const legacyRead = vi.spyOn(api, "getSubmission").mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" }));
  const legacySave = vi.spyOn(api, "saveSubmission"); const read = vi.spyOn(api, "getSubmissionCheck"); const start = vi.spyOn(api, "startSubmissionCheck");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByText("미래 프로토콜 모임");
  await waitFor(() => expect(document.body).toHaveTextContent(/지원.*일치|지원하지.*버전|업데이트|지원.*계약/));
  expect(screen.queryByRole("textbox", { name: /시간·장소 조건/ })).not.toBeInTheDocument();
  expect(legacyRead).not.toHaveBeenCalled(); expect(legacySave).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
});
