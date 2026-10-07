// Independent same-status joined-owner retry lifecycle regression; no live backend/provider.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const oldContext = "55555555-5555-4555-8555-555555555555";
const newContext = "66666666-6666-4666-8666-666666666666";
const disabled = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const delayed: Room = {
  invite_code: code, purpose: "합성 지연 재시도 참여자 수명 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "ANALYSIS_DELAYED", viewer: { joined: true, role: "HOST", display_name: "합성 이전 주최자", context_id: oldContext },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", state_version: 10, revision_generation: 1,
  revision_round: null, analysis_id: "11111111-1111-4111-8111-111111111111", capabilities: disabled, remaining_correction_analyses: 2,
};
const newRoom: Room = { ...delayed, state_version: 12, viewer: { joined: true, role: "MEMBER", display_name: "합성 새 참여자", context_id: newContext } };
const newOwn: Submission = { raw_text: "새 참여자만 볼 수 있는 합성 저장 원문", revision: 1, editable: false, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z", revision_round_id: null, state_version: 12 };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

describe("delayed retries belong to their initiating joined-owner context", () => {
  it.each([200, 403] as const)("ignores a former HOST retry %s after a joined MEMBER context takes over the same delayed view", async status => {
    const reads = vi.spyOn(api, "getRoom").mockResolvedValue(delayed);
    vi.spyOn(api, "getSubmission").mockResolvedValue(newOwn);
    let release!: (room: Room) => void;
    let reject!: (error: Error) => void;
    const retry = vi.spyOn(api, "retryAnalysis").mockImplementation(() => new Promise((resolve, fail) => { release = resolve; reject = fail; }));
    // Every other potential write is intercepted too. Unexpected execution must
    // fail assertions without ever reaching an actual backend or model boundary.
    const save = vi.spyOn(api, "saveSubmission").mockRejectedValue(new Error("unexpected synthetic save"));
    const analyze = vi.spyOn(api, "analyzeRevision").mockRejectedValue(new Error("unexpected synthetic analysis"));
    const reopen = vi.spyOn(api, "reopenRoom").mockRejectedValue(new Error("unexpected synthetic reopen"));
    const close = vi.spyOn(api, "closeRoom").mockRejectedValue(new Error("unexpected synthetic close"));
    const confirm = vi.spyOn(api, "confirmCandidate").mockRejectedValue(new Error("unexpected synthetic confirmation"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
    clients.push(client);
    client.setQueryData(["submission", "another-synthetic-room"], newOwn);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "분석 다시 요청" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    const originalMutation = client.getMutationCache().getAll().find(mutation => mutation.options.mutationKey?.[0] === "room" && mutation.options.mutationKey?.[1] === code);
    expect(originalMutation?.state.status).toBe("pending");

    // Keep ANALYSIS_DELAYED throughout. Going through OPEN or unjoined would
    // unmount DelayedState and hide the same-mounted-component lifetime defect.
    reads.mockResolvedValue(newRoom);
    await act(async () => { await client.invalidateQueries({ queryKey: ["room", code] }); });
    await screen.findByText("합성 새 참여자님이 참여한 모임");
    expect(screen.queryByRole("button", { name: "분석 다시 요청" })).not.toBeInTheDocument();
    const details = screen.getByText("내 저장 입력 확인", { exact: true }).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await screen.findByText(newOwn.raw_text!, { exact: true });
    const ownKey = client.getQueryCache().findAll({ queryKey: ["submission", code] }).find(query => (query.state.data as Submission | undefined)?.raw_text === newOwn.raw_text)?.queryKey;
    expect(ownKey).toBeDefined();
    expect(client.getQueryData(ownKey!)).toEqual(newOwn);

    await act(async () => {
      if (status === 200) release({ ...delayed, state_version: 11, public_status: "ANALYZING" });
      else reject(new ApiError(403, { detail: "이전 주최자 재시도 요청의 합성 권한 거부" }));
    });
    // Hold the original mutation object even if a buggy denial removes its cache
    // entry; this observes completed callbacks rather than relying on one tick.
    await waitFor(() => expect(originalMutation?.state.status).toBe(status === 200 ? "success" : "error"));
    expect(client.getQueryData<Room>(["room", code])?.viewer).toEqual(newRoom.viewer);
    expect(client.getQueryData<Room>(["room", code])?.public_status).toBe("ANALYSIS_DELAYED");
    expect(client.getQueryData(ownKey!)).toEqual(newOwn);
    expect(screen.getByText(newOwn.raw_text!, { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "모임을 불러오지 못했어요" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "분석 다시 요청" })).not.toBeInTheDocument();
    expect(screen.queryByText("내가 만든 모임", { exact: true })).not.toBeInTheDocument();
    expect(client.getQueryData(["submission", "another-synthetic-room"])).toEqual(newOwn);
    expect(retry).toHaveBeenCalledTimes(1);
    for (const command of [save, analyze, reopen, close, confirm]) expect(command).not.toHaveBeenCalled();
  });
});
