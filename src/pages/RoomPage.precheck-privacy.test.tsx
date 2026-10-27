import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api/client";
import type { Room } from "../api/types";
import * as accountHook from "../auth/useAccount";
import RoomPage from "./RoomPage";

// PS16/27/28: a private new-protocol raw=null is not a legacy time-grid record.
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); });
describe("#107 public unapplied summary privacy wording", () => {
  it.each(["PRE_SUBMIT_V1", "LEGACY"] as const)("keeps %s raw=null readable without inventing an input format", async submission_protocol => {
    const code = "abcdefghijklmnopqrstuv";
    const room: Room = { invite_code: code, purpose: "미반영 요약 개인정보 경계", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z", public_status: "NO_MATCH", state_version: 9, viewer: { joined: true, display_name: "주최자", role: "HOST", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol };
    vi.spyOn(accountHook, "useAccountSession").mockReturnValue({ accessToken: "synthetic-host-only", expiresAt: "2030-01-01T00:00:00Z", account: { id: "22222222-2222-4222-8222-222222222222", displayName: "주최자" } });
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([{ participant_display_name: "다른 참여자", raw_text: null, reason: "AMBIGUOUS_TIME_CONSTRAINT" }]);
    vi.spyOn(api, "getCandidates").mockResolvedValue({ quality: "PARTIAL", applied_submissions: 0, total_submissions: 2, unapplied_inputs: 1, candidates: [] });
    vi.spyOn(api, "getSubmissionCheck").mockResolvedValue({ candidate: null, accepted: null, check: null, submission_complete: false, applied_to_result: false, room: { collection_status: "CLOSED", state_version: 9, submission_deadline: null }, operation_outcome: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    const summary = await screen.findByText(/반영되지 않은 입력.*확인/); const details = summary.closest("details")!; details.open = true; fireEvent(details, new Event("toggle"));
    await screen.findByText("다른 참여자");
    if (submission_protocol === "PRE_SUBMIT_V1") {
      expect(document.body).toHaveTextContent(/개인 입력 원문.*비공개/);
      expect(document.body).not.toHaveTextContent("기존 시간표만 제출되어 자연어 원문이 없어요.");
    } else {
      expect(document.body).toHaveTextContent("기존 시간표만 제출되어 자연어 원문이 없어요.");
    }
    expect(document.body).not.toHaveTextContent("synthetic-host-only");
  });
});
