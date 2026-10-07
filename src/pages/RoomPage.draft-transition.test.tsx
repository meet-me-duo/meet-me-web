// Independent follow-up. Intended path src/pages/RoomPage.draft-transition.test.tsx.
// No production changes or test execution by this author.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const code = "abcdefghijklmnopqrstuv";
const otherCode = "zyxwvutsrqponmlkjihgfe";
const a0 = "11111111-1111-4111-8111-111111111111";
const a1 = "22222222-2222-4222-8222-222222222222";
const c1 = "33333333-3333-4333-8333-333333333333";
const c2 = "44444444-4444-4444-8444-444444444444";
const draft = "목요일 20시부터 21시. 아직 저장하지 않은 합성 조건";
const stored = "서버에 저장된 합성 조건";
const caps = { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false };
const base: Room = {
  invite_code: code, purpose: "합성 미저장 수정 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
  expected_participants: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
  public_status: "COLLECTING", viewer: { joined: true, display_name: "합성 구성원", role: "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  state_version: 11, revision_generation: 1, revision_round: { id: c1, generation: 1, status: "OPEN" }, analysis_id: a0,
  capabilities: { ...caps, can_edit_own_submission: true }, remaining_correction_analyses: 3,
};
const queued: Room = { ...base, public_status: "ANALYZING", state_version: 12, revision_round: null, analysis_id: a1, capabilities: caps };
function own(raw_text = stored, revision = 7): Submission {
  return { raw_text, revision, editable: true, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" };
}
const candidate: Candidate = { candidate_id: a1, plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "합성 후보", time_ranges: [{ start_at: "2026-10-08T11:00:00Z", end_at: "2026-10-08T12:00:00Z" }] };
const clients: QueryClient[] = [];
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(`/rooms/${otherCode}`)}>합성 다른 모임으로 이동</button><button onClick={() => navigate(`/rooms/${code}`)}>합성 원래 모임으로 이동</button></>;
}
function mount(snapshot: Room = base) {
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  vi.spyOn(api, "getSubmission").mockResolvedValue(own());
  vi.spyOn(api, "getCandidates").mockResolvedValue({ analysis_id: a0, quality: "PARTIAL", applied_submissions: 1, total_submissions: 2, unapplied_inputs: 1, candidates: [candidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  vi.spyOn(api, "getResult").mockResolvedValue({ candidate, confirmed_at: "2026-10-07T14:00:00Z" });
  const save = vi.spyOn(api, "saveSubmission"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Navigation /><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { client, reads, save, fetch };
}
async function makeDraft() {
  fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
  const input = await screen.findByRole("textbox");
  fireEvent.change(input, { target: { value: draft } });
  expect(input).toHaveValue(draft);
}
async function advance(client: QueryClient, reads: { mockResolvedValue: (value: Room) => unknown }, snapshot: Room) {
  reads.mockResolvedValue(snapshot);
  await client.invalidateQueries({ queryKey: ["room", code] });
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("member draft crossing a host analysis transition", () => {
  it("warns before quota-zero editing that saving is allowed but changed versions cannot produce a new result", async () => {
    const { save, fetch } = mount({ ...base, remaining_correction_analyses: 0 });
    await screen.findByText(/새.*분석.*횟수.*(소진|사용)/);
    expect(screen.getByText(/수정.*저장.*가능.*새.*(결과|분석)/)).toBeInTheDocument();
    expect(screen.getByText(/입력.*바꾸지.*(기존|재사용)|변경.*없.*(기존|재사용)/)).toBeInTheDocument();
    expect(screen.getByText(/되돌.*저장.*(필요|재사용.*(안|않|불가))/)).toBeInTheDocument();
    await makeDraft();
    expect(screen.getByRole("button", { name: "수정 내용 저장" })).toBeEnabled();
    expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("retains an in-memory read-only draft when another HOST starts analysis and restores it for C2", async () => {
    const { client, reads, save, fetch } = mount();
    await makeDraft();
    await advance(client, reads, queued);
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    const preserved = await screen.findByDisplayValue(draft);
    expect(preserved).toHaveAttribute("readonly");
    expect(screen.getByText(/저장하지 않은.*분석|미저장.*분석/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정 내용 저장" })).not.toBeInTheDocument();
    const reopened: Room = { ...base, state_version: 14, revision_generation: 2, revision_round: { id: c2, generation: 2, status: "OPEN" }, analysis_id: a1 };
    await advance(client, reads, reopened);
    await waitFor(() => expect(screen.getByDisplayValue(draft)).not.toHaveAttribute("readonly"));
    expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([12, 11])("clears draft and private cache for an unjoined viewer independently of coordination stamp %s", async state_version => {
    const { client, reads } = mount();
    await makeDraft(); await advance(client, reads, queued);
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    await advance(client, reads, { ...queued, state_version, viewer: { joined: false, display_name: null, role: null }, capabilities: caps });
    await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueryData(["submission", code])).toBeUndefined());
    await advance(client, reads, { ...base, state_version: 15, revision_generation: 2, revision_round: { id: c2, generation: 2, status: "OPEN" } });
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue(stored);
  });

  it("purges an in-memory draft on 403 and does not restore it after access returns", async () => {
    const { client, reads } = mount(); await makeDraft();
    reads.mockRejectedValue(new ApiError(403, { detail: "합성 접근 거부" }));
    await client.invalidateQueries({ queryKey: ["room", code] });
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    reads.mockResolvedValue({ ...base, state_version: 15 });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue(stored);
  });

  it("never shows a room's draft in another room or retains it across a viewer change", async () => {
    const { client, reads, save, fetch } = mount(); await makeDraft();
    reads.mockImplementation(async requested => requested === otherCode ? { ...base, invite_code: otherCode, purpose: "합성 다른 모임" } : base);
    vi.mocked(api.getSubmission).mockImplementation(async requested => requested === otherCode ? own("다른 모임 저장 입력") : own());
    fireEvent.click(screen.getByRole("button", { name: "합성 다른 모임으로 이동" }));
    await screen.findByText("합성 다른 모임");
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue("다른 모임 저장 입력");
    fireEvent.click(screen.getByRole("button", { name: "합성 원래 모임으로 이동" }));
    await screen.findByText(base.purpose);
    await advance(client, reads, { ...base, state_version: 15, viewer: { joined: true, role: "MEMBER", display_name: "합성 다른 세션" } });
    // A room stamp does not identify an owner. This mock provides a different viewer/owner response.
    vi.mocked(api.getSubmission).mockResolvedValue(own("다른 세션의 본인 입력"));
    await client.invalidateQueries({ queryKey: ["submission", code] });
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("private read/confirmation authorization is a room-level boundary", () => {
  const ready: Room = { ...base, public_status: "READY_WITH_WARNINGS", revision_round: null, viewer: { joined: true, role: "HOST", display_name: "합성 주최자" }, capabilities: { ...caps, can_open_revision: true, can_confirm: true } };
  it.each(["candidates", "unapplied", "result"] as const)("purges cached owner data and host commands when %s returns 403", async kind => {
    const { client } = mount(kind === "result" ? { ...ready, public_status: "CONFIRMED", capabilities: caps } : ready);
    const failure = new ApiError(403, { detail: "합성 비공개 조회 거부" });
    if (kind === "candidates") vi.mocked(api.getCandidates).mockRejectedValue(failure);
    if (kind === "unapplied") vi.mocked(api.getUnappliedInputs).mockRejectedValue(failure);
    if (kind === "result") vi.mocked(api.getResult).mockRejectedValue(failure);
    client.setQueryData(["submission", code], own("권한 만료 전의 본인 원문"));
    client.setQueryData(["submission", otherCode], own("다른 모임의 본인 원문"));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await waitFor(() => expect(client.getQueryData(["submission", code])).toBeUndefined());
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
    expect(screen.queryByText("권한 만료 전의 본인 원문")).not.toBeInTheDocument();
    expect(client.getQueryData(["submission", otherCode])).toEqual(own("다른 모임의 본인 원문"));
  });

  it("purges room-private caches and commands after candidate confirmation returns 403", async () => {
    const { client } = mount(ready);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "confirmCandidate").mockRejectedValue(new ApiError(403, { detail: "합성 후보 확정 권한 거부" }));
    client.setQueryData(["submission", code], own());
    fireEvent.click(await screen.findByRole("button", { name: /Plan A.*선택/ }));
    await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    await waitFor(() => expect(client.getQueryData(["submission", code])).toBeUndefined());
    expect(screen.queryByRole("button", { name: "조건 수정 열기" })).not.toBeInTheDocument();
    expect(client.getMutationCache().getAll().filter(mutation => mutation.options.mutationKey?.[1] === code)).toHaveLength(0);
  });

  it.each([["role", 11], ["display_name", 11], ["role", 10], ["display_name", 10]] as const)("clears the old owner context before the new %s viewer at coordination stamp %s loads its own input", async (field, state_version) => {
    const editableHost: Room = { ...base, viewer: ready.viewer, capabilities: { ...base.capabilities!, can_analyze_revision: true } };
    const { client, reads } = mount(editableHost);
    await makeDraft();
    let release!: (value: Submission) => void;
    vi.mocked(api.getSubmission).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const next: Room = { ...editableHost, state_version, viewer: field === "role" ? { joined: true, role: "MEMBER", display_name: "합성 주최자" } : { joined: true, role: "HOST", display_name: "합성 새 세션" } };
    await advance(client, reads, next);
    await waitFor(() => expect(client.getQueryData(["submission", code])).toBeUndefined());
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    expect(screen.queryByText(stored, { exact: true })).not.toBeInTheDocument();
    await waitFor(() => expect(release).toBeDefined());
    release(own("새 viewer가 저장한 본인 입력", 1));
    await screen.findByText("새 viewer가 저장한 본인 입력", { exact: true });
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
  });

  it.each([11, 10])("uses the opaque owner cache context for identical-name/role viewers at stamp %s without exposing the former owner's input", async state_version => {
    const oldViewer = { ...base.viewer, context_id: "55555555-5555-4555-8555-555555555555" };
    const newViewer = { ...base.viewer, context_id: "66666666-6666-4666-8666-666666666666" };
    const { client, reads, save, fetch } = mount({ ...base, viewer: oldViewer });
    await makeDraft();
    let release!: (value: Submission) => void;
    vi.mocked(api.getSubmission).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await advance(client, reads, { ...base, state_version, viewer: newViewer });
    await waitFor(() => expect(client.getQueryData(["submission", code])).toBeUndefined());
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    expect(screen.queryByText(stored, { exact: true })).not.toBeInTheDocument();
    await waitFor(() => expect(release).toBeDefined());
    release(own("다른 context의 본인 입력", 1));
    await screen.findByText("다른 context의 본인 입력", { exact: true });
    expect(screen.queryByDisplayValue(draft)).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("refetches room state after a stale confirmation 409 without confirming an obsolete candidate again", async () => {
    const { client, reads } = mount(ready);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const confirm = vi.spyOn(api, "confirmCandidate").mockRejectedValue(new ApiError(409, { detail: "이전 분석의 후보예요." }));
    reads.mockResolvedValue({ ...base, state_version: 13, viewer: ready.viewer, capabilities: { ...base.capabilities!, can_analyze_revision: true } });
    fireEvent.click(await screen.findByRole("button", { name: /Plan A.*선택/ }));
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    expect(screen.queryByRole("button", { name: /Plan A.*선택/ })).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Room>(["room", code])?.state_version).toBe(13);
  });

  it("does not display the previous analysis rejected raw input while the new analysis read is pending", async () => {
    const { client, reads } = mount(ready);
    vi.mocked(api.getUnappliedInputs).mockResolvedValue([{ participant_display_name: "합성 참여자", raw_text: "A0의 미반영 원문", reason: "AMBIGUOUS_TIME_CONSTRAINT" }]);
    await screen.findByText("A0의 미반영 원문", { exact: true });
    await advance(client, reads, { ...base, state_version: 12, viewer: ready.viewer, capabilities: { ...base.capabilities!, can_analyze_revision: true } });
    await screen.findByRole("button", { name: "수정한 조건으로 다시 분석" });
    let release!: (value: Awaited<ReturnType<typeof api.getUnappliedInputs>>) => void;
    vi.mocked(api.getUnappliedInputs).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    vi.mocked(api.getCandidates).mockResolvedValue({ analysis_id: a1, quality: "PARTIAL", applied_submissions: 1, total_submissions: 2, unapplied_inputs: 1, candidates: [candidate] } as Awaited<ReturnType<typeof api.getCandidates>>);
    await advance(client, reads, { ...ready, state_version: 15, revision_generation: 1, analysis_id: a1 });
    await waitFor(() => expect(release).toBeDefined());
    expect(screen.queryByText("A0의 미반영 원문", { exact: true })).not.toBeInTheDocument();
    release([{ participant_display_name: "합성 새 참여자", raw_text: "A1의 미반영 원문", reason: "AMBIGUOUS_TIME_CONSTRAINT" }]);
    await screen.findByText("A1의 미반영 원문", { exact: true });
    expect(screen.queryByText("A0의 미반영 원문", { exact: true })).not.toBeInTheDocument();
  });
});
