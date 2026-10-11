// Follow-up independent lifecycle boundaries. Place in src/pages after owner approval.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const a0 = "11111111-1111-4111-8111-111111111111";
const round = "33333333-3333-4333-8333-333333333333";
const caps = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const ready: Room = {
  invite_code: code, purpose: "합성 권한 요청 수명 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "READY_WITH_WARNINGS", viewer: { joined: true, display_name: "합성 주최자", role: "HOST" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 10, revision_generation: 0, revision_round: null, analysis_id: a0,
  capabilities: { ...caps, can_open_revision: true, can_confirm: true }, remaining_correction_analyses: 3,
};
const candidate: Candidate = { candidate_id: a0, plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "합성 후보", time_ranges: [{ start_at: "2026-10-08T11:00:00Z", end_at: "2026-10-08T12:00:00Z" }] };
function own(raw_text = "합성 저장 입력", revision = 7): Submission {
  return { raw_text, revision, editable: true, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" };
}
const clients: QueryClient[] = [];
function mount(snapshot: Room) {
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  vi.spyOn(api, "getSubmission").mockResolvedValue(own());
  vi.spyOn(api, "getCandidates").mockResolvedValue({ analysis_id: a0, quality: "PARTIAL", applied_submissions: 1, total_submissions: 2, unapplied_inputs: 1, candidates: [candidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  const save = vi.spyOn(api, "saveSubmission");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { client, reads, save };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

describe("authorization responses are scoped to the request's mounted owner context", () => {
  it("ignores an old confirmation 403 after a new viewer has begun editing its own draft", async () => {
    const { client, reads, save } = mount(ready);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let reject!: (error: Error) => void;
    const confirm = vi.spyOn(api, "confirmCandidate").mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    fireEvent.click(await screen.findByRole("button", { name: /Plan A.*선택/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const oldMutation = client.getMutationCache().getAll().find(mutation => mutation.options.mutationKey?.[0] === "candidates" && mutation.options.mutationKey?.[1] === code);
    expect(oldMutation).toBeDefined();
    const nextViewer = { joined: true, display_name: "합성 새 구성원", role: "MEMBER" as const, context_id: "66666666-6666-4666-8666-666666666666" };
    const next: Room = { ...ready, public_status: "COLLECTING", state_version: 11, revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" }, viewer: nextViewer, capabilities: { ...caps, can_edit_own_submission: true } };
    reads.mockResolvedValue(next);
    vi.mocked(api.getSubmission).mockResolvedValue(own("새 구성원의 저장 입력", 1));
    await client.invalidateQueries({ queryKey: ["room", code] });
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "새 구성원의 미저장 수정" } });
    await act(async () => { reject(new ApiError(403, { detail: "이전 주최자 요청의 뒤늦은 권한 거부" })); });
    // Observe completion of the original mutation even if its cache entry was removed.
    // This waits for lifecycle callbacks rather than assuming one microtask flush is enough.
    await waitFor(() => expect(oldMutation?.state.status).toBe("error"));
    expect(screen.getByRole("textbox")).toHaveValue("새 구성원의 미저장 수정");
    expect(screen.queryByRole("heading", { name: "모임을 불러오지 못했어요" })).not.toBeInTheDocument();
    expect(client.getQueryData<Room>(["room", code])?.viewer.display_name).toBe("합성 새 구성원");
    expect(confirm).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });

  it("purges this room's private caches and host controls when a delayed technical retry returns 403", async () => {
    const { client, save } = mount({ ...ready, public_status: "ANALYSIS_DELAYED", capabilities: caps });
    const retry = vi.spyOn(api, "retryAnalysis").mockRejectedValue(new ApiError(403, { detail: "합성 지연 재시도 권한 거부" }));
    client.setQueryData(["submission", code], own());
    client.setQueryData(["submission", "another-room"], own("다른 모임의 입력"));
    fireEvent.click(await screen.findByRole("button", { name: "분석 다시 요청" }));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await waitFor(() => { for (const key of ["room", "submission", "candidates", "unapplied", "result"]) expect(client.getQueryData([key, code])).toBeUndefined(); });
    expect(screen.queryByRole("button", { name: "분석 다시 요청" })).not.toBeInTheDocument();
    expect(client.getQueryData(["submission", "another-room"])).toEqual(own("다른 모임의 입력"));
    expect(retry).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });
});
