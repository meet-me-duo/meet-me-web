// Independent cancelled-room-GET regression. Intended path src/pages; not executed by author.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api/client";
import type { Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const a0 = "11111111-1111-4111-8111-111111111111";
const round = "33333333-3333-4333-8333-333333333333";
const oldContext = "55555555-5555-4555-8555-555555555555";
const newContext = "66666666-6666-4666-8666-666666666666";
const caps = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const initial: Room = {
  invite_code: code, purpose: "합성 늦은 방 조회 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "NO_MATCH", viewer: { joined: true, display_name: "합성 이전 참여자", role: "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 10, revision_generation: 0, revision_round: null, analysis_id: a0, capabilities: caps, remaining_correction_analyses: 3,
};
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); client = undefined; vi.restoreAllMocks(); });

describe("cancelled room reads cannot mutate the new owner context", () => {
  it("preserves a new owner's draft when an aborted old-context GET ignores cancellation and returns late", async () => {
    const oldViewer = { ...initial.viewer, context_id: oldContext };
    const oldRoom: Room = { ...initial, viewer: oldViewer };
    const newViewer = { joined: true, display_name: "합성 새 참여자", role: "MEMBER" as const, context_id: newContext };
    const newRoom: Room = { ...initial, public_status: "COLLECTING", state_version: 11, revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" }, viewer: newViewer, capabilities: { ...caps, can_edit_own_submission: true } };
    const reads = vi.spyOn(api, "getRoom").mockResolvedValue(oldRoom);
    const stored: Submission = { raw_text: "새 참여자의 저장 입력", revision: 1, editable: true, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" };
    vi.spyOn(api, "getSubmission").mockResolvedValue(stored);
    const save = vi.spyOn(api, "saveSubmission"); const analyze = vi.spyOn(api, "analyzeRevision");
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText(initial.purpose);
    let release!: (room: Room) => void;
    let oldSignal: AbortSignal | undefined;
    // This fake intentionally ignores cancellation. A cancelled query may discard its
    // cache write; queryFn side effects must independently respect the request lifecycle.
    reads.mockImplementationOnce((_code, signal) => new Promise(resolve => { release = resolve; oldSignal = signal; }));
    const oldRefresh = client.invalidateQueries({ queryKey: ["room", code] });
    await waitFor(() => expect(release).toBeDefined());
    reads.mockResolvedValue(newRoom);
    await client.invalidateQueries({ queryKey: ["room", code] }, { cancelRefetch: true });
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    const draft = "새 참여자의 저장하지 않은 수정 조건";
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: draft } });
    await screen.findByText(/아직 저장되지 않았어요/);
    await act(async () => {
      release(oldRoom);
      await oldRefresh;
      // Drain the queued request continuation and Query notification task. This is
      // synchronization, not a timeout used to make a broken assertion pass.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    expect(client.getQueryData<Room>(["room", code])?.viewer.display_name).toBe(newViewer.display_name);
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    const queued: Room = { ...newRoom, state_version: 12, public_status: "ANALYZING", revision_round: null, capabilities: caps };
    reads.mockResolvedValue(queued);
    await client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    const preserved = await screen.findByDisplayValue(draft);
    expect(preserved).toHaveAttribute("readonly");
    expect(save).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
  });
});
