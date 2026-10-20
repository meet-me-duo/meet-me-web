import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// PS09/12: an explicit early-close confirmation is one pending operation, even
// when the server requires a second request. It must not unlock for duplicates.
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
it("#107 holds the close lock through the confirmed early-close request", async () => {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1); vi.spyOn(window, "confirm").mockReturnValue(true);
  const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "수동 조기 마감 단일 작업", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "주최자", role: "HOST", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue({ candidate: null, accepted: null, check: null, submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null });
  let finishClose!: (value: Room) => void;
  const pending = new Promise<Room>(resolve => { finishClose = resolve; });
  const close = vi.spyOn(api, "closeRoom").mockRejectedValueOnce(new ApiError(409, { code: "EARLY_CLOSE_CONFIRMATION_REQUIRED" })).mockReturnValue(pending);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={room} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  const button = await screen.findByRole("button", { name: "입력 마감하기" });
  fireEvent.click(button);
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2)); await act(async () => { await Promise.resolve(); });
  expect(close.mock.calls).toEqual([[room.invite_code, false], [room.invite_code, true]]);
  expect(screen.getByRole("button", { name: /마감/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /마감/ })); expect(close).toHaveBeenCalledTimes(2);
  await act(async () => finishClose({ ...room, collection_status: "CLOSED", public_status: "ANALYZING", state_version: 2, closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z" }));
});
