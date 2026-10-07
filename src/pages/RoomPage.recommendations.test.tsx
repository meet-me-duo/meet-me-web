import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room } from "../api/types";
import RoomPage from "./RoomPage";

// Public native #95 contract, not the UI model or backend ranking implementation.
const code = "abcdefghijklmnopqrstuv";
const a0 = "11111111-1111-4111-8111-111111111111";
const a1 = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const member = "44444444-4444-4444-8444-444444444444";
const o1 = "55555555-5555-4555-8555-555555555555";
const o2 = "66666666-6666-4666-8666-666666666666";
const o3 = "77777777-7777-4777-8777-777777777777";
const o4 = "88888888-8888-4888-8888-888888888888";
const o5 = "99999999-9999-4999-8999-999999999999";
const v1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const v2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type RecommendationList = Awaited<ReturnType<typeof api.getRecommendations>>;
type Option = RecommendationList["options"][number];
type Result = Awaited<ReturnType<typeof api.getResult>>;
const disabled = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const ready: Room = {
  invite_code: code, purpose: "합성 추천 계약 검증", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-15", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "CLOSED",
  closure_reason: "MANUAL", closed_at: "2026-10-07T00:00:00Z", public_status: "READY",
  viewer: { joined: true, display_name: "합성 주최자", role: "HOST", context_id: owner }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 10, revision_generation: 0, revision_round: null, analysis_id: a0,
  capabilities: { ...disabled, can_confirm: true }, remaining_correction_analyses: 3, recommendation_protocol: "diverse-time-v1",
};
function option(id = o1, rank: number | null = 1, day = "08", place = "강남"): Option {
  return { option_id: id, rank, summary: `합성 10월 ${day}일 가능한 시간`, time_range: { start_at: `2026-10-${day}T01:00:00Z`, end_at: `2026-10-${day}T05:00:00Z` }, variants: [
    { variant_id: v1, meeting_mode: "IN_PERSON", attendance_count: 4, total_participants: 4, partial_attendance: false, place: { display_name: place, latitude: null, longitude: null } },
    { variant_id: v2, meeting_mode: "REMOTE", attendance_count: 3, total_participants: 4, partial_attendance: true, place: null },
  ] };
}
function list(options: Option[] = [option()], extra: Partial<RecommendationList> = {}): RecommendationList {
  return { protocol: "diverse-time-v1", analysis_id: a0, state_version: 10, quality: "COMPLETE", total_options: options.length, options, has_alternatives: false, next_cursor: null, ...extra };
}
const legacyCandidate: Candidate = { candidate_id: o1, plan_type: "A", rank: 1, meeting_mode: "REMOTE", attendance_count: 4, total_participants: 4, place: null, summary: "기존 서버의 합성 플랜", time_ranges: [{ start_at: "2026-10-08T01:00:00Z", end_at: "2026-10-08T05:00:00Z" }] };
const selectionBody = { analysis_id: a0, variant_id: v2, start_at: "2026-10-08T01:30:00.000Z", end_at: "2026-10-08T02:15:00.000Z" };
const result: Result = { candidate: { ...legacyCandidate, candidate_id: null, plan_type: "C", attendance_count: 3, summary: "실제로 확정된 합성 일정", time_ranges: [{ start_at: selectionBody.start_at, end_at: selectionBody.end_at }] }, confirmed_at: "2026-10-07T12:00:00Z", selection: { protocol: "diverse-time-v1", option_id: o1, ...selectionBody } };

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}
const clients: QueryClient[] = [];
function mount(snapshot: Room = ready, primary: RecommendationList = list()) {
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  const recommendations = vi.spyOn(api, "getRecommendations").mockResolvedValue(primary);
  const alternatives = vi.spyOn(api, "getRecommendationAlternatives").mockResolvedValue(list([], { total_options: 1, has_alternatives: true }));
  const confirm = vi.spyOn(api, "confirmRecommendation").mockResolvedValue(result);
  const candidates = vi.spyOn(api, "getCandidates").mockResolvedValue({ analysis_id: a0, quality: "COMPLETE", applied_submissions: 4, total_submissions: 4, unapplied_inputs: 0, candidates: [legacyCandidate] });
  const legacyConfirm = vi.spyOn(api, "confirmCandidate").mockResolvedValue({ candidate: legacyCandidate, confirmed_at: result.confirmed_at, selection: null });
  const own = vi.spyOn(api, "getSubmission").mockResolvedValue({ raw_text: "합성 본인 비공개 입력", revision: 7, editable: false, locale: "ko-KR", created_at: "2026-10-07T00:00:00Z" });
  const unapplied = vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  const results = vi.spyOn(api, "getResult").mockResolvedValue(result);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client, reads, recommendations, alternatives, confirm, candidates, legacyConfirm, own, unapplied, results };
}
async function chooseOnline() {
  fireEvent.click(await screen.findByRole("radio", { name: /온라인/ }));
  fireEvent.click(screen.getAllByRole("button", { name: "이 시간 선택" })[0]!);
  fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "2026-10-08T10:30" } });
  fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "2026-10-08T11:15" } });
}
async function refresh(view: ReturnType<typeof mount>, room: Room, primary: RecommendationList = list([], { analysis_id: a1, state_version: 11 })) {
  view.reads.mockResolvedValue(room); view.recommendations.mockResolvedValue(primary);
  await act(async () => { await view.client.invalidateQueries({ queryKey: ["room", code] }); });
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#19 native protocol routing and recommendation presentation", () => {
  it.each([1, 3])("shows exactly %s real primary choices through the new endpoint", async count => {
    const primary = [option(), option(o2, 2, "09", "잠실"), option(o3, 3, "10", "홍대")].slice(0, count);
    const view = mount(ready, list(primary));
    await screen.findByRole("heading", { name: "추천안 1" });
    expect(screen.getAllByRole("article")).toHaveLength(count);
    expect(view.recommendations).toHaveBeenCalledWith(code, expect.any(AbortSignal));
    expect(view.candidates).not.toHaveBeenCalled(); expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("preserves each variant's attendance and mode instead of treating rank as fixed A/B/C categories", async () => {
    mount();
    const local = await screen.findByRole("radio", { name: /대면.*강남|강남.*대면/ });
    expect(local).toHaveAccessibleName(/4\/4/);
    expect(screen.getByRole("radio", { name: /온라인/ })).toHaveAccessibleName(/3\/4/);
    expect(local).toHaveAccessibleName(/10:00.*14:00/);
    expect(screen.queryByText(/Plan [ABC]/)).not.toBeInTheDocument();
  });
  it.each([null, undefined])("keeps legacy reads and confirmation for protocol %s", async protocol => {
    const snapshot = { ...ready, recommendation_protocol: protocol };
    if (protocol === undefined) delete snapshot.recommendation_protocol;
    const view = mount(snapshot);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "Plan A 선택" }));
    await waitFor(() => expect(view.legacyConfirm).toHaveBeenCalledWith(code, o1));
    expect(view.candidates).toHaveBeenCalledTimes(1);
    expect(view.recommendations).not.toHaveBeenCalled(); expect(view.confirm).not.toHaveBeenCalled();
  });
  it("blocks an unknown room protocol without trying legacy candidates or either POST route", async () => {
    const view = mount({ ...ready, recommendation_protocol: "diverse-time-v2" });
    await screen.findByText(ready.purpose);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: /이 시간 선택|Plan [ABC] 선택|일정 확정/ })).not.toBeInTheDocument();
    expect(view.recommendations).not.toHaveBeenCalled(); expect(view.candidates).not.toHaveBeenCalled();
    expect(view.confirm).not.toHaveBeenCalled(); expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("blocks an unsupported recommendation response even when the room advertises v1", async () => {
    const view = mount(ready, list([option()], { protocol: "unexpected-v2" }));
    await waitFor(() => expect(view.recommendations).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(view.candidates).not.toHaveBeenCalled(); expect(view.confirm).not.toHaveBeenCalled();
  });
  it("keeps MEMBER recommendations readable while ignoring an accidentally true host capability", async () => {
    const view = mount({ ...ready, viewer: { ...ready.viewer, role: "MEMBER", context_id: member } });
    await screen.findByRole("heading", { name: "추천안 1" });
    expect(screen.getByRole("radio", { name: /온라인/ })).toHaveAccessibleName(/3\/4/);
    expect(screen.queryByRole("button", { name: /이 시간 선택|일정 확정/ })).not.toBeInTheDocument();
    expect(view.confirm).not.toHaveBeenCalled(); expect(view.legacyConfirm).not.toHaveBeenCalled(); expect(view.unapplied).not.toHaveBeenCalled();
  });
});

describe("#19 native confirmation and saved selection", () => {
  it("sends the exact analysis/variant/user-selected instants and renders the typed confirmed result", async () => {
    const view = mount(); await chooseOnline();
    expect(view.confirm).not.toHaveBeenCalled();
    view.reads.mockResolvedValue({ ...ready, public_status: "CONFIRMED", state_version: 11, capabilities: disabled });
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.confirm).toHaveBeenCalledWith(code, o1, selectionBody));
    await screen.findByRole("heading", { name: "실제 모임 일정이 확정됐어요" });
    expect(screen.getByRole("article")).toHaveTextContent("10:30");
    expect(screen.getByRole("article")).toHaveTextContent("11:15");
    expect(screen.getByRole("article")).toHaveTextContent("3/4");
    expect(screen.getByRole("article")).toHaveTextContent("온라인");
    expect(screen.queryByText(/Plan C/)).not.toBeInTheDocument();
    expect(screen.queryByText(/실제 모임 날짜·시간.*따로/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /이 시간 선택|일정 확정|조건 수정 열기|수정한 조건으로 다시 분석/ })).not.toBeInTheDocument();
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("preserves both actual-time inputs after a 503 and retries only when explicitly clicked", async () => {
    const view = mount(); view.confirm.mockRejectedValue(new ApiError(503, { code: "REQUEST_LIMIT_STORE_UNAVAILABLE", detail: "합성 확정 저장소 장애" }));
    await chooseOnline(); fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await screen.findByText("합성 확정 저장소 장애");
    expect(view.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("시작 시간")).toHaveValue("2026-10-08T10:30");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("2026-10-08T11:15");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.confirm).toHaveBeenCalledTimes(2));
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it.each(["start_at", "end_at"] as const)("reloads rather than accepting a confirmation whose returned %s differs from the requested full tuple", async field => {
    const view = mount(); await chooseOnline();
    view.confirm.mockResolvedValue({ ...result, selection: { ...result.selection!, [field]: field === "start_at" ? "2026-10-08T01:31:00.000Z" : "2026-10-08T02:16:00.000Z" } });
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.recommendations.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("종료 시간")).not.toBeInTheDocument();
    expect(view.results).not.toHaveBeenCalled();
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it.each([
    ["2026-10-08T01:30:00.000000Z", "2026-10-08T02:15:00.000000Z"],
    ["2026-10-08T10:30:00+09:00", "2026-10-08T11:15:00+09:00"],
  ])("accepts a returned full tuple with semantically equivalent instant spellings (%s)", async (start_at, end_at) => {
    const view = mount(); await chooseOnline();
    view.confirm.mockResolvedValue({ ...result, selection: { ...result.selection!, start_at, end_at } });
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.reads).toHaveBeenCalledTimes(2));
    expect(view.recommendations).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("시작 시간")).toBeInTheDocument();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("2026-10-08T10:30");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("2026-10-08T11:15");
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("does not query recommendations or reopen editing for an already CONFIRMED room", async () => {
    const view = mount({ ...ready, public_status: "CONFIRMED", capabilities: { ...disabled, can_confirm: true, can_open_revision: true, can_analyze_revision: true } });
    await screen.findByRole("heading", { name: "실제 모임 일정이 확정됐어요" });
    expect(view.results).toHaveBeenCalledTimes(1);
    expect(view.recommendations).not.toHaveBeenCalled(); expect(view.alternatives).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /이 시간 선택|일정 확정|조건 수정 열기|수정한 조건으로 다시 분석/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Plan C/)).not.toBeInTheDocument();
  });
});

describe("#19 native alternatives paging and stale resets", () => {
  it("starts without a cursor, passes the opaque next cursor, and stops at null even when has_alternatives remains true", async () => {
    const view = mount(ready, list([option()], { total_options: 3, has_alternatives: true, next_cursor: null }));
    const cursor = "opaque+/=&?%23";
    view.alternatives.mockResolvedValueOnce(list([option(o4, null, "11", "판교")], { total_options: 3, has_alternatives: true, next_cursor: cursor }))
      .mockResolvedValueOnce(list([option(o5, null, "12", "건대")], { total_options: 3, has_alternatives: true, next_cursor: null }));
    expect(view.alternatives).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "다른 가능한 시간 보기" }));
    await screen.findByText(/판교/);
    expect(view.alternatives.mock.calls[0]?.[0]).toBe(code);
    expect(view.alternatives.mock.calls[0]?.[1]).toEqual({ analysis_id: a0, limit: 20 });
    expect(view.alternatives.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" }));
    await screen.findByText(/건대/);
    expect(view.alternatives.mock.calls[1]?.[1]).toEqual({ analysis_id: a0, cursor, limit: 20 });
    expect(screen.queryByRole("button", { name: "다른 가능한 시간 보기" })).not.toBeInTheDocument();
    expect(view.alternatives).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("heading", { name: /다른 가능한 시간 \d/ })).toHaveLength(2);
  });
  it("resets the current selection and reloads room/primary after a STALE_ANALYSIS confirmation", async () => {
    const view = mount(); await chooseOnline();
    view.confirm.mockRejectedValue(new ApiError(409, { code: "STALE_ANALYSIS", detail: "합성 분석 갱신 필요" }));
    const fresh = list([option(o2, 1, "09", "새 분석 지역")], { analysis_id: a1, state_version: 11 });
    view.reads.mockResolvedValue({ ...ready, analysis_id: a1, state_version: 11 }); view.recommendations.mockResolvedValue(fresh);
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await screen.findByText(/새 분석 지역/);
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(view.reads.mock.calls.length).toBeGreaterThan(1);
    expect(view.recommendations.mock.calls.length).toBeGreaterThan(1);
    expect(view.confirm).toHaveBeenCalledTimes(1); expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("discards previous alternatives and restarts the first page with the new analysis after 409", async () => {
    const view = mount(ready, list([option()], { total_options: 4, has_alternatives: true }));
    view.alternatives.mockResolvedValueOnce(list([option(o4, null, "11", "과거 대안 지역")], { total_options: 4, has_alternatives: true, next_cursor: "old-opaque" }))
      .mockRejectedValueOnce(new ApiError(409, { code: "STALE_ANALYSIS", detail: "합성 stale 페이지" }))
      .mockResolvedValueOnce(list([option(o5, null, "12", "새 대안 지역")], { analysis_id: a1, state_version: 11, total_options: 2, has_alternatives: true }));
    fireEvent.click(await screen.findByRole("button", { name: "다른 가능한 시간 보기" })); await screen.findByText(/과거 대안 지역/);
    view.reads.mockResolvedValue({ ...ready, analysis_id: a1, state_version: 11 });
    view.recommendations.mockResolvedValue(list([option(o2, 1, "09", "새 분석 지역")], { analysis_id: a1, state_version: 11, total_options: 2, has_alternatives: true }));
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" })); await screen.findByText(/새 분석 지역/);
    expect(screen.queryByText(/과거 대안 지역/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" })); await screen.findByText(/새 대안 지역/);
    expect(view.alternatives.mock.calls[2]?.[1]).toEqual({ analysis_id: a1, limit: 20 });
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("never renders a primary response from a different analysis", async () => {
    const view = mount(ready, list([option(o4, 1, "11", "다른 분석의 비공개 지역")], { analysis_id: a1 }));
    await waitFor(() => expect(view.recommendations).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/다른 분석의 비공개 지역/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(view.candidates).not.toHaveBeenCalled();
  });
});

describe("#19 recommendation authorization and request lifetime", () => {
  it.each([401, 403, 404])("treats primary %s as loss of room access and purges this room's private caches only", async status => {
    const view = mount();
    view.client.setQueryData(["submission", code, owner], { raw_text: "이 방의 이전 본인 입력" });
    view.client.setQueryData(["submission", "other-room"], { raw_text: "다른 방의 입력" });
    view.recommendations.mockRejectedValue(new ApiError(status, { detail: "합성 추천 접근 거부" }));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await waitFor(() => {
      const retained = view.client.getQueryCache().getAll().filter(query => query.queryKey[1] === code && ["submission", "recommendations", "recommendation-alternatives", "candidates", "unapplied", "result"].includes(String(query.queryKey[0])));
      expect(retained).toHaveLength(0);
    });
    expect(view.client.getQueryData(["submission", "other-room"])).toEqual({ raw_text: "다른 방의 입력" });
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("treats a current confirmation 403 as access loss rather than trying a legacy confirmation", async () => {
    const view = mount(); await chooseOnline();
    view.confirm.mockRejectedValue(new ApiError(403, { detail: "합성 새 확정 권한 거부" }));
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("ignores a late alternatives page after the active analysis changes", async () => {
    const view = mount(ready, list([option()], { total_options: 3, has_alternatives: true }));
    const pending = deferred<RecommendationList>(); view.alternatives.mockReturnValueOnce(pending.promise);
    fireEvent.click(await screen.findByRole("button", { name: "다른 가능한 시간 보기" }));
    await waitFor(() => expect(view.alternatives).toHaveBeenCalledTimes(1));
    await refresh(view, { ...ready, analysis_id: a1, state_version: 11 }, list([option(o2, 1, "09", "지금 분석 지역")], { analysis_id: a1, state_version: 11 }));
    await screen.findByText(/지금 분석 지역/);
    await act(async () => { pending.resolve(list([option(o4, null, "11", "늦은 과거 대안 지역")], { has_alternatives: true, total_options: 3 })); });
    expect(screen.queryByText(/늦은 과거 대안 지역/)).not.toBeInTheDocument();
    expect(screen.getByText(/지금 분석 지역/)).toBeInTheDocument();
  });
  it("ignores an old confirmation 403 after the viewer changes to a MEMBER context", async () => {
    const view = mount(); const pending = deferred<Result>(); view.confirm.mockReturnValueOnce(pending.promise);
    await chooseOnline(); fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.confirm).toHaveBeenCalledTimes(1));
    const oldMutation = view.client.getMutationCache().getAll().find(mutation => mutation.state.status === "pending");
    expect(oldMutation).toBeDefined();
    await refresh(view, { ...ready, viewer: { ...ready.viewer, role: "MEMBER", context_id: member, display_name: "합성 새 참여자" } }, list());
    await screen.findByRole("heading", { name: "추천안 1" });
    await act(async () => { pending.reject(new ApiError(403, { detail: "이전 주최자의 늦은 거부" })); });
    await waitFor(() => expect(oldMutation?.state.status).toBe("error"));
    expect(screen.queryByRole("heading", { name: "모임을 불러오지 못했어요" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(view.client.getQueryData<Room>(["room", code])?.viewer.context_id).toBe(member);
  });
  it("does not invalidate current room/result data when an old confirmation resolves after unmount", async () => {
    const view = mount(); const pending = deferred<Result>(); view.confirm.mockReturnValueOnce(pending.promise);
    await chooseOnline(); fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(view.confirm).toHaveBeenCalledTimes(1));
    const mutation = view.client.getMutationCache().getAll().find(item => item.state.status === "pending");
    expect(mutation).toBeDefined(); view.unmount();
    const invalidate = vi.spyOn(view.client, "invalidateQueries"); invalidate.mockClear();
    await act(async () => { pending.resolve(result); });
    await waitFor(() => expect(mutation?.state.status).toBe("success"));
    expect(invalidate).not.toHaveBeenCalled(); expect(view.results).not.toHaveBeenCalled();
  });
  it("stops a stale-analysis reload that was waiting for query cancellation when its screen unmounts", async () => {
    const view = mount(); await chooseOnline();
    const cancellation = deferred<void>();
    const cancel = vi.spyOn(view.client, "cancelQueries").mockReturnValue(cancellation.promise);
    view.confirm.mockRejectedValue(new ApiError(409, { code: "STALE_ANALYSIS", detail: "합성 지연 취소 경합" }));
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    const mutation = view.client.getMutationCache().getAll().find(item => item.state.status === "pending");
    expect(mutation).toBeDefined(); view.unmount();
    const invalidate = vi.spyOn(view.client, "invalidateQueries");
    const remove = vi.spyOn(view.client, "removeQueries");
    await act(async () => { cancellation.resolve(); });
    await waitFor(() => expect(mutation?.state.status).toBe("error"));
    expect(invalidate).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("does not let a background primary 503 mask alternatives %s authorization loss", async status => {
    const view = mount(ready, list([option()], { total_options: 2, has_alternatives: true }));
    const page = deferred<RecommendationList>(); view.alternatives.mockReturnValueOnce(page.promise);
    fireEvent.click(await screen.findByRole("button", { name: "다른 가능한 시간 보기" }));
    await waitFor(() => expect(view.alternatives).toHaveBeenCalledTimes(1));
    view.client.setQueryData(["submission", code, owner], { raw_text: "겹친 오류 전의 합성 본인 입력" });
    view.client.setQueryData(["submission", "other-room"], { raw_text: "다른 방 입력 보존" });
    view.recommendations.mockRejectedValue(new ApiError(503, { detail: "합성 백그라운드 추천 장애" }));
    await act(async () => {
      await view.client.invalidateQueries({ predicate: query => query.queryKey[0] === "recommendations" && query.queryKey.includes("primary") });
    });
    await screen.findByText("합성 백그라운드 추천 장애");
    await act(async () => { page.reject(new ApiError(status, { detail: "합성 대안 권한 거부" })); });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeInTheDocument());
    await waitFor(() => {
      expect(view.client.getQueryCache().getAll().filter(query => query.queryKey[1] === code && ["submission", "recommendations"].includes(String(query.queryKey[0])))).toHaveLength(0);
    });
    expect(view.client.getQueryData(["submission", "other-room"])).toEqual({ raw_text: "다른 방 입력 보존" });
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
  it("preserves the current selection, inputs and focus after a background primary 503 and retries only on request", async () => {
    const view = mount(); await chooseOnline();
    const start = screen.getByLabelText("시작 시간"); start.focus();
    view.recommendations.mockRejectedValue(new ApiError(503, { detail: "합성 갱신 실패 입력 보존" }));
    await act(async () => {
      await view.client.invalidateQueries({ predicate: query => query.queryKey[0] === "recommendations" && query.queryKey.includes("primary") });
    });
    await screen.findByText("합성 갱신 실패 입력 보존");
    expect(screen.queryByLabelText("시작 시간")).toBe(start);
    expect(start).toHaveValue("2026-10-08T10:30");
    expect(start).toHaveFocus();
    expect(screen.getByLabelText("종료 시간")).toHaveValue("2026-10-08T11:15");
    expect(view.recommendations).toHaveBeenCalledTimes(2);
    expect(view.confirm).not.toHaveBeenCalled();
    view.recommendations.mockResolvedValue(list());
    fireEvent.click(screen.getByRole("button", { name: /다시 시도|추천 시간 다시 확인/ }));
    await waitFor(() => expect(view.recommendations).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("시작 시간")).toHaveValue("2026-10-08T10:30");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("2026-10-08T11:15");
    expect(view.legacyConfirm).not.toHaveBeenCalled();
  });
});
