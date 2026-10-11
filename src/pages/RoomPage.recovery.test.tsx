// Draft placement: src/pages/RoomPage.recovery.test.tsx.
// Not executed. Tests bind only accepted HTTP contracts, not proposed API method names.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const a0 = "11111111-1111-4111-8111-111111111111";
const a1 = "22222222-2222-4222-8222-222222222222";
const c1 = "33333333-3333-4333-8333-333333333333";
const c2 = "44444444-4444-4444-8444-444444444444";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Capabilities = { can_edit_own_submission: boolean; can_open_revision: boolean; can_analyze_revision: boolean; can_confirm: boolean; can_force_reparse: boolean };
type Round = { id: string; generation: number; status: "OPEN" | "CONSUMED" };
type RecoveryRoom = Room & { state_version: number; revision_generation: number; revision_round: Round | null; analysis_id: string | null; capabilities: Capabilities; remaining_correction_analyses: number };
const disabled: Capabilities = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const base: RecoveryRoom = {
  invite_code: code, purpose: "합성 복구 테스트", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: "2026-10-01T00:00:00Z", manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "NO_MATCH", viewer: { joined: true, display_name: "합성 주최자", role: "HOST" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 10, revision_generation: 0, revision_round: null, analysis_id: a0,
  capabilities: { ...disabled, can_open_revision: true }, remaining_correction_analyses: 3,
};
function opened(overrides: Partial<RecoveryRoom> = {}): RecoveryRoom {
  return { ...base, state_version: 11, public_status: "COLLECTING", revision_generation: 1, revision_round: { id: c1, generation: 1, status: "OPEN" }, capabilities: { ...disabled, can_edit_own_submission: true, can_analyze_revision: true, can_force_reparse: true }, ...overrides };
}
function own(raw_text = "평일 19시부터 21시", revision = 7, editable = true): Submission {
  return { raw_text, revision, editable, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" };
}
const candidate: Candidate = { candidate_id: a1, plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "새 합성 결과", time_ranges: [{ start_at: "2026-10-08T11:00:00Z", end_at: "2026-10-08T12:00:00Z" }] };
const clients: QueryClient[] = [];
function mount(snapshot: Room) {
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  vi.spyOn(api, "getSubmission").mockResolvedValue(own());
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  vi.spyOn(api, "getCandidates").mockResolvedValue({ analysis_id: snapshot === base ? a0 : a1, quality: "PARTIAL", applied_submissions: 1, total_submissions: 2, unapplied_inputs: 1, candidates: [candidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { client, reads };
}
function command(response: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status, headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function payload(fetch: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  const init = fetch.mock.calls[index]?.[1] as RequestInit;
  expect(init.credentials).toBe("include");
  expect(init.method).toBe("POST");
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}
async function edit() {
  const input = screen.queryByRole("textbox");
  if (input) return input;
  fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
  return screen.findByRole("textbox");
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("correction contracts and same-room recovery", () => {
  it("keeps old-server results readable without recovery commands", async () => {
    const additions = new Set(["state_version", "revision_generation", "revision_round", "analysis_id", "capabilities", "remaining_correction_analyses"]);
    const legacy = Object.fromEntries(Object.entries(base).filter(([key]) => !additions.has(key))) as unknown as Room;
    const fetch = command({});
    mount(legacy);
    await screen.findByText("내 저장 입력 확인");
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["HOST", "MEMBER"] as const)("requires the viewer-specific open capability for %s", async role => {
    mount({ ...base, viewer: { ...base.viewer, role }, capabilities: disabled });
    await screen.findByText("내 저장 입력 확인");
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
  });

  it.each(["READY", "ANALYZING", "ANALYSIS_DELAYED", "CONFIRMED"] as const)("does not manufacture a correction command in %s", async public_status => {
    vi.spyOn(api, "getResult").mockResolvedValue({ candidate, confirmed_at: "2026-10-07T14:00:00Z" });
    mount({ ...base, public_status, capabilities: disabled });
    await screen.findByText("내 저장 입력 확인");
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
  });

  it("opens one round from the exact active analysis/generation without saving or analyzing", async () => {
    const fetch = command({ room: opened(), round: { id: c1, generation: 1, status: "OPEN" } });
    const save = vi.spyOn(api, "saveSubmission");
    mount(base);
    fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/rooms/${code}/reopen`);
    expect(payload(fetch)).toEqual({ request_id: expect.stringMatching(uuid), source_analysis_id: a0, expected_generation: 0 });
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "입력 마감하기" })).not.toBeInTheDocument();
    expect(screen.queryByText(/목표 2명 제출 시/)).not.toBeInTheDocument();
  });

  it("does not offer new participation in a DB-CLOSED/public-COLLECTING round", async () => {
    const join = vi.spyOn(api, "joinRoom");
    mount(opened({ viewer: { joined: false, role: null, display_name: null }, capabilities: disabled }));
    await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    expect(screen.queryByRole("button", { name: "모임 참여하기" })).not.toBeInTheDocument();
    expect(join).not.toHaveBeenCalled();
  });

  it("does not expose correction editing to a joined viewer outside the submitted cohort", async () => {
    const save = vi.spyOn(api, "saveSubmission");
    mount(opened({ viewer: { ...base.viewer, role: "MEMBER" }, capabilities: disabled }));
    await screen.findByText("합성 복구 테스트");
    const editButton = screen.queryByRole("button", { name: "내 조건 수정" });
    expect(editButton === null || editButton.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정한 조건으로 다시 분석" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([3, 0])("sends the current round/revision only on explicit save (remaining=%s)", async remaining => {
    mount(opened({ remaining_correction_analyses: remaining }));
    const save = vi.spyOn(api, "saveSubmission").mockResolvedValue({ ...own("목요일 20시부터 21시", 8), raw_text: "목요일 20시부터 21시" });
    const input = await edit();
    fireEvent.change(input, { target: { value: "목요일 20시부터 21시" } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(code, { raw_text: "목요일 20시부터 21시", revision_round_id: c1, expected_revision: 7 }));
  });

  it("retains a failed owner edit and does not analyze unsaved text", async () => {
    mount(opened());
    const save = vi.spyOn(api, "saveSubmission").mockRejectedValue(new ApiError(503, { detail: "합성 저장 장애" }));
    const fetch = command({});
    const input = await edit();
    fireEvent.change(input, { target: { value: "목요일 20시부터 21시" } });
    expect(screen.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await screen.findByText("합성 저장 장애");
    expect(input).toHaveValue("목요일 20시부터 21시");
    expect(save).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves a newer draft when polling receives another saved revision", async () => {
    const { client } = mount(opened());
    const input = await edit();
    fireEvent.change(input, { target: { value: "아직 저장하지 않은 내 수정" } });
    vi.mocked(api.getSubmission).mockResolvedValue(own("다른 탭에서 저장된 내용", 8));
    await client.invalidateQueries({ queryKey: ["submission", code] });
    expect(input).toHaveValue("아직 저장하지 않은 내 수정");
    expect(screen.getByText(/아직 저장되지 않았어요/)).toBeInTheDocument();
  });

  it("analyzes saved inputs with force_reparse=false and never calls the legacy close/retry routes", async () => {
    const result = { ...base, public_status: "ANALYZING" as const, state_version: 12, revision_generation: 1, revision_round: null, analysis_id: a1, capabilities: disabled, remaining_correction_analyses: 2 };
    const fetch = command({ outcome: "QUEUED", analysis_id: a1, revision_round_id: c1, room: result }, 202);
    const save = vi.spyOn(api, "saveSubmission"); const close = vi.spyOn(api, "closeRoom"); const retry = vi.spyOn(api, "retryAnalysis");
    mount(opened());
    fireEvent.click(await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/rooms/${code}/analysis`);
    expect(payload(fetch)).toEqual({ revision_round_id: c1, request_id: expect.stringMatching(uuid), force_reparse: false });
    expect(save).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
  });

  it("allows unchanged-result reuse at zero remaining quota", async () => {
    const reused = { ...base, state_version: 12, revision_generation: 1, remaining_correction_analyses: 0 };
    const fetch = command({ outcome: "REUSED", analysis_id: a0, revision_round_id: c1, room: reused });
    mount(opened({ remaining_correction_analyses: 0, capabilities: { ...opened().capabilities, can_force_reparse: false } }));
    const analyze = await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(analyze).toBeEnabled(); fireEvent.click(analyze);
    await screen.findByRole("button", { name: "조건 수정 열기" });
    expect(payload(fetch).force_reparse).toBe(false);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("requires an explicit force choice and never implies polling or saving requests one", async () => {
    const fetch = command({ outcome: "QUEUED", analysis_id: a1, revision_round_id: c1, room: { ...base, public_status: "ANALYZING", state_version: 12, analysis_id: a1, capabilities: disabled } }, 202);
    mount(opened());
    const force = await screen.findByRole("checkbox", { name: /바꾸지 않은 입력도 다시 해석/ });
    expect(force).not.toBeChecked(); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(force); fireEvent.click(screen.getByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(payload(fetch).force_reparse).toBe(true);
  });

  it("hides force reparse when the server does not authorize it", async () => {
    mount(opened({ capabilities: { ...opened().capabilities, can_force_reparse: false }, remaining_correction_analyses: 0 }));
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(screen.queryByRole("checkbox", { name: /바꾸지 않은 입력도 다시 해석/ })).not.toBeInTheDocument();
  });

  it("keeps reopen/save available at quota zero and treats its permanent analysis failure separately", async () => {
    const { reads } = mount(opened({ remaining_correction_analyses: 0 }));
    reads.mockResolvedValue(opened({ remaining_correction_analyses: 0 }));
    const fetch = command({ code: "CORRECTION_ANALYSIS_LIMIT_REACHED", detail: "이 모임의 추가 분석 횟수를 모두 사용했어요." }, 409);
    fireEvent.click(await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await screen.findByText("이 모임의 추가 분석 횟수를 모두 사용했어요.");
    expect(screen.getByRole("button", { name: "내 조건 수정" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/잠시 후|분 후/)).not.toBeInTheDocument();
  });

  it("reuses the operation request ID after a temporary failure and blocks pending double clicks", async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; })).mockResolvedValue(new Response(JSON.stringify({ room: opened(), round: { id: c1, generation: 1, status: "OPEN" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch); mount(base);
    fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const first = payload(fetch);
    const pending = await screen.findByRole("button", { name: "요청 중…" });
    expect(pending).toBeDisabled(); fireEvent.click(pending); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { release(new Response(JSON.stringify({ detail: "합성 일시 장애" }), { status: 503 })); });
    fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(payload(fetch, 1)).toEqual(first);
  });

  it.each([403, 409, 429, 503])("handles correction command %s without writing an owner draft", async status => {
    const next = status === 409 ? opened({ state_version: 13, revision_generation: 2, revision_round: { id: c2, generation: 2, status: "OPEN" } }) : base;
    const { client, reads } = mount(base); reads.mockResolvedValue(next);
    const save = vi.spyOn(api, "saveSubmission");
    const fetch = command({ code: status === 403 ? "HOST_PERMISSION_REQUIRED" : "CORRECTION_COMMAND_REJECTED", detail: "합성 명령 실패", retry_after_seconds: status === 429 ? 7 : undefined }, status);
    client.setQueryData(["submission", "another-room"], own("다른 모임 원문"));
    fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    if (status !== 409) await screen.findByText("합성 명령 실패");
    else await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(fetch).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
    if (status === 403) await waitFor(() => { for (const key of ["room", "submission", "candidates", "unapplied", "result"]) expect(client.getQueryData([key, code])).toBeUndefined(); });
    if (status === 409) await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(client.getQueryData(["submission", "another-room"])).toEqual(own("다른 모임 원문"));
  });
});

describe("monotonic room state and scoped candidate publication", () => {
  it("ignores an old OPEN room snapshot after same-generation/no-op reuse consumed it", async () => {
    const consumed = { ...base, state_version: 12, revision_generation: 1 };
    const { client, reads } = mount(consumed);
    await screen.findByRole("button", { name: "조건 수정 열기" });
    reads.mockResolvedValue(opened({ state_version: 11 }));
    await client.invalidateQueries({ queryKey: ["room", code] });
    expect(screen.getByRole("button", { name: "조건 수정 열기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정한 조건으로 다시 분석" })).not.toBeInTheDocument();
  });

  it("accepts equal state_version when viewer access has expired instead of trusting an old capability", async () => {
    const { client, reads } = mount(base);
    await screen.findByRole("button", { name: "조건 수정 열기" });
    reads.mockResolvedValue({ ...base, viewer: { joined: false, role: null, display_name: null }, capabilities: disabled });
    await client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
  });

  it("does not downgrade saved owner revision when an older GET arrives after save", async () => {
    const { client } = mount(opened());
    vi.spyOn(api, "saveSubmission").mockResolvedValue({ ...own("저장된 새 입력", 8), raw_text: "저장된 새 입력" });
    const input = await edit();
    fireEvent.change(input, { target: { value: "저장된 새 입력" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await screen.findByText("저장된 입력 #8");
    vi.mocked(api.getSubmission).mockResolvedValue(own("뒤늦게 도착한 이전 입력", 7));
    await client.invalidateQueries({ queryKey: ["submission", code] });
    expect(screen.getByText("저장된 입력 #8")).toBeInTheDocument();
    expect(screen.queryByText("뒤늦게 도착한 이전 입력")).not.toBeInTheDocument();
  });

  it("ignores a late C1 command snapshot after the current room has advanced to C2", async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const { client, reads } = mount(base);
    fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const current = opened({ state_version: 14, revision_generation: 2, revision_round: { id: c2, generation: 2, status: "OPEN" } });
    reads.mockResolvedValue(current);
    await client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    await act(async () => { release(new Response(JSON.stringify({ room: opened(), round: { id: c1, generation: 1, status: "OPEN" } }), { status: 200 })); });
    expect(client.getQueryData<RecoveryRoom>(["room", code])?.state_version).toBe(14);
    expect(client.getQueryData<RecoveryRoom>(["room", code])?.revision_round?.id).toBe(c2);
  });

  it("does not confuse a C1 operation replay with its current C2 room snapshot", async () => {
    const current = opened({ state_version: 14, revision_generation: 2, revision_round: { id: c2, generation: 2, status: "OPEN" } });
    const fetch = command({ room: current, round: { id: c1, generation: 1, status: "CONSUMED" } });
    mount(base); fireEvent.click(await screen.findByRole("button", { name: "조건 수정 열기" }));
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    fetch.mockResolvedValue(new Response(JSON.stringify({ outcome: "REUSED", analysis_id: a0, revision_round_id: c2, room: { ...base, state_version: 15, revision_generation: 2 } }), { status: 200 }));
    fireEvent.click(screen.getByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(payload(fetch, 1).revision_round_id).toBe(c2);
  });

  it("purges previous candidates when recovery opens and shows only the new analysis result", async () => {
    const oldCandidate = { ...candidate, candidate_id: a0, summary: "예전 합성 후보" };
    const { client, reads } = mount({ ...base, public_status: "READY_WITH_WARNINGS", capabilities: { ...base.capabilities, can_confirm: true } });
    vi.mocked(api.getCandidates).mockResolvedValue({ analysis_id: a0, quality: "PARTIAL", applied_submissions: 1, total_submissions: 2, unapplied_inputs: 1, candidates: [oldCandidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
    await client.invalidateQueries({ queryKey: ["candidates", code] });
    await screen.findByText("예전 합성 후보");
    const fetch = command({ room: opened(), round: { id: c1, generation: 1, status: "OPEN" } });
    fireEvent.click(screen.getByRole("button", { name: "조건 수정 열기" }));
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(screen.queryByText("예전 합성 후보")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plan A.*선택/ })).not.toBeInTheDocument();
    const queued = { ...base, state_version: 12, revision_generation: 1, public_status: "ANALYZING" as const, analysis_id: a1, capabilities: disabled };
    fetch.mockResolvedValue(new Response(JSON.stringify({ outcome: "QUEUED", analysis_id: a1, revision_round_id: c1, room: queued }), { status: 202 }));
    fireEvent.click(screen.getByRole("button", { name: "수정한 조건으로 다시 분석" }));
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    reads.mockResolvedValue({ ...queued, state_version: 13, public_status: "READY", capabilities: { ...disabled, can_confirm: true } });
    vi.mocked(api.getCandidates).mockResolvedValue({ analysis_id: a1, quality: "COMPLETE", applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0, candidates: [candidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
    await client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByText("새 합성 결과");
    expect(screen.queryByText("예전 합성 후보")).not.toBeInTheDocument();
  });

  it("fails closed when a candidate response belongs to a different analysis", async () => {
    const { client } = mount({ ...base, public_status: "READY", state_version: 15, analysis_id: a1, capabilities: { ...disabled, can_confirm: true } });
    vi.mocked(api.getCandidates).mockResolvedValue({ analysis_id: a0, quality: "COMPLETE", applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0, candidates: [{ ...candidate, summary: "타 분석 후보" }] } as Awaited<ReturnType<typeof api.getCandidates>>);
    await screen.findByText("합성 복구 테스트");
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ["candidates", code] }).some(query => query.state.fetchStatus === "idle" && query.state.status !== "pending")).toBe(true));
    expect(screen.queryByText("타 분석 후보")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plan A.*선택/ })).not.toBeInTheDocument();
  });
});
