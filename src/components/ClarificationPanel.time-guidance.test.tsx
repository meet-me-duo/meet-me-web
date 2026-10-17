// Independent public copy/accessibility contract for complete DIRECT replacements.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MeetingMode, Room } from "../api/types";
import ClarificationPanel from "./ClarificationPanel";

const code = "abcdefghijklmnopqrstuv";
const round = "11111111-1111-4111-8111-111111111111";
const samples: Record<MeetingMode, string> = {
  REMOTE: "내일 오후 7~8시, 비대면으로 가능해요",
  IN_PERSON: "내일 오후 7~8시, 강남 근처가 좋아요",
  EITHER: "내일 오후 7~8시, 강남 근처가 좋아요",
};
const room: Room = {
  invite_code: code, purpose: "합성 전체 조건 시간 안내", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
  public_status: "COLLECTING", viewer: { joined: true, display_name: "합성 본인", role: "MEMBER", context_id: round }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 11, revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" },
  capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false },
};
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#107 time guidance for clarification DIRECT input", () => {
  it.each(["REMOTE", "IN_PERSON", "EITHER"] as const)("keeps an accessible AM/PM hint and mode-appropriate example visible for %s", async mode => {
    const get = vi.spyOn(api, "getClarifications").mockResolvedValue({ questions: [{ question_id: round, source_revision: 7, excerpt: "내일 7-8시쯤", question: "오전인가요 오후인가요?", option_a: "내일 오전 7~8시", option_b: "내일 오후 7~8시", editable: true }], state_version: 11 });
    const answer = vi.spyOn(api, "answerClarification"); const save = vi.spyOn(api, "saveSubmission"); const analyze = vi.spyOn(api, "analyzeRevision");
    const unexpectedFetch = vi.fn().mockRejectedValue(new Error("Unexpected network request for static guidance")); vi.stubGlobal("fetch", unexpectedFetch);
    const onSaved = vi.fn(); const onAccessDenied = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><ClarificationPanel room={{ ...room, meeting_mode: mode }} onSaved={onSaved} onAccessDenied={onAccessDenied} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("radio", { name: "직접 입력" })); const input = screen.getByRole("textbox");
    expect(screen.getByText(/시간은 오전·오후를 함께 적어 주세요/)).toBeVisible();
    expect(input).toHaveAttribute("placeholder", expect.stringContaining(samples[mode]));
    expect(input).toHaveAccessibleDescription(/시간은 오전·오후를 함께 적어 주세요/);
    expect(input).toHaveAccessibleDescription(/19~20시/);
    fireEvent.change(input, { target: { value: "내일 7-8시쯤" } });
    expect(input).toHaveValue("내일 7-8시쯤");
    expect(screen.getByText(/시간은 오전·오후를 함께 적어 주세요/)).toBeVisible();
    expect(input).toHaveAccessibleDescription(/시간은 오전·오후를 함께 적어 주세요/);
    expect(answer).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled(); expect(onAccessDenied).not.toHaveBeenCalled(); expect(unexpectedFetch).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(1);
  });
});
