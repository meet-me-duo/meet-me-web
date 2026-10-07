// Independent cold-owner cache regression. Intended path src/pages; not executed by author.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api/client";
import type { Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const newContext = "66666666-6666-4666-8666-666666666666";
const viewer = { joined: true, display_name: "합성 새 참여자", role: "MEMBER" as const, context_id: newContext };
const room: Room = {
  invite_code: code, purpose: "합성 cold owner cache 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "COLLECTING", viewer, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 11, revision_generation: 1,
  revision_round: { id: "33333333-3333-4333-8333-333333333333", generation: 1, status: "OPEN" },
  analysis_id: "11111111-1111-4111-8111-111111111111", remaining_correction_analyses: 3,
  capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false },
};
const oldText = "이전 참여자만 볼 수 있는 합성 비공개 원문";
const newText = "새 참여자의 합성 저장 원문";
function own(raw_text: string, revision: number): Submission {
  return { raw_text, revision, editable: true, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" };
}
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); client = undefined; vi.restoreAllMocks(); });

describe("native owner context isolates submission cache on cold room reads", () => {
  it("never reveals an unscoped former owner's raw while the new owner's GET is pending, then accepts new revision1", async () => {
    const reads = vi.spyOn(api, "getRoom").mockResolvedValue(room);
    let release!: (submission: Submission) => void;
    const ownRead = vi.spyOn(api, "getSubmission").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const save = vi.spyOn(api, "saveSubmission");
    const analyze = vi.spyOn(api, "analyzeRevision");
    const retry = vi.spyOn(api, "retryAnalysis");
    const close = vi.spyOn(api, "closeRoom");
    const reopen = vi.spyOn(api, "reopenRoom");
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
    // Simulate a surviving private cache from another participant without a room
    // snapshot. A context-change comparison against an old room cannot protect this.
    client.setQueryData(["submission", code], own(oldText, 7));
    expect(client.getQueryData(["room", code])).toBeUndefined();
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText(room.purpose);
    await waitFor(() => expect(ownRead).toHaveBeenCalledTimes(1));
    expect(client.getQueryData<Room>(["room", code])?.viewer.display_name).toBe(viewer.display_name);
    expect(screen.queryByText(oldText)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(oldText)).not.toBeInTheDocument();
    expect(screen.queryByText("저장된 입력 #7")).not.toBeInTheDocument();
    await act(async () => { release(own(newText, 1)); });
    await screen.findByText(newText);
    expect(screen.getByText("저장된 입력 #1")).toBeInTheDocument();
    expect(screen.queryByText(oldText)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(oldText)).not.toBeInTheDocument();
    expect(ownRead).toHaveBeenCalledTimes(1); expect(reads).toHaveBeenCalledTimes(1);
    for (const command of [save, analyze, retry, close, reopen]) expect(command).not.toHaveBeenCalled();
  });
});
