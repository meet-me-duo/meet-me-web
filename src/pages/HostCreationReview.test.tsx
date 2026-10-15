// Acceptance cases supplied by the independent read-only reviewer after the initial implementation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, SavedSubmission } from "../api/types";
import App from "../App";

const code = "abcdefghijklmnopqrstuv", otherCode = "zyxwvutsrqponmlkjihgfe";
const raw = "  화요일 저녁, 아직 저장 여부를 확인하지 않은 합성 조건  ";
const host: Room = {
  invite_code: code, purpose: "독립 리뷰 후속", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-15", search_end_date: "2026-10-29", search_range_source: "DEFAULTED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 0,
  viewer: { joined: true, display_name: "합성 주최자", role: "HOST", context_id: "synthetic-owner-1" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};
const candidate: Candidate = { candidate_id: "candidate", plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "합성 후보", time_ranges: [{ start_at: "2026-10-16T11:00:00Z", end_at: "2026-10-16T12:00:00Z" }] };
const saved: SavedSubmission = { raw_text: raw.trim(), revision: 1, locale: "ko-KR", created_at: "2026-10-15T00:00:00Z", editable: false };
const clients: QueryClient[] = [];
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(`/rooms/${otherCode}`)}>합성 다른 방</button><button onClick={() => navigate(`/rooms/${code}`)}>합성 원래 방</button></>;
}
function setup(path = `/rooms/${code}`) {
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(host);
  const own = vi.spyOn(api, "getSubmission").mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" }));
  const save = vi.spyOn(api, "saveSubmission"); const create = vi.spyOn(api, "createRoom"); const join = vi.spyOn(api, "joinRoom");
  vi.spyOn(api, "getCandidates").mockResolvedValue({ quality: "COMPLETE", candidates: [candidate], applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0 });
  vi.spyOn(api, "getResult").mockResolvedValue({ candidate, confirmed_at: "2026-10-15T01:00:00Z" });
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Navigation /><App /></MemoryRouter></QueryClientProvider>);
  return { client, reads, own, save, create, join };
}
async function typeInitialDraft() {
  const input = await screen.findByRole("textbox");
  fireEvent.change(input, { target: { value: raw } });
  return input;
}
function closed(status: Room["public_status"]): Room {
  return { ...host, public_status: status, collection_status: "CLOSED", closure_reason: "DEADLINE", closed_at: "2026-10-15T01:00:00Z", state_version: 1 };
}
async function advance(client: QueryClient, reads: ReturnType<typeof setup>["reads"], room: Room) {
  reads.mockResolvedValue(room);
  await act(async () => { await client.invalidateQueries({ queryKey: ["room", code] }); });
}
async function submitCreation() {
  fireEvent.change(screen.getByLabelText("주최자 이름"), { target: { value: "합성 주최자" } });
  fireEvent.change(screen.getByLabelText("모임 목적 / 이름"), { target: { value: host.purpose } });
  fireEvent.click(screen.getByRole("button", { name: /다음 단계/ }));
  fireEvent.click(await screen.findByRole("button", { name: "방 만들기" }));
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); });

describe("independent review: initial HOST draft boundaries", () => {
  it.each(["ANALYZING", "INSUFFICIENT_PARTICIPANTS", "READY", "CONFIRMED"] as const)("retains only an in-memory read-only initial draft after %s", async status => {
    const { client, reads, save, create, join } = setup(); await typeInitialDraft();
    await advance(client, reads, closed(status));
    await waitFor(() => expect(screen.getByDisplayValue(raw, { normalizer: value => value })).toHaveAttribute("readonly"));
    expect(screen.getByDisplayValue(raw, { normalizer: value => value })).toHaveValue(raw);
    expect(screen.queryByRole("button", { name: /조건 제출하기|수정 내용 저장/ })).not.toBeInTheDocument();
    expect(screen.getByText(/저장하지 않은.*분석/)).toBeInTheDocument();
    expect(screen.getByText(/새로고침하거나 다른 모임으로 이동하면 사라져요/)).toBeInTheDocument();
    expect(JSON.stringify(localStorage)).not.toContain(raw.trim());
    expect(save).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled();
  });

  it("retains the first input on a rejected deadline save and does not permit closed editing", async () => {
    const { reads, save } = setup(); await typeInitialDraft();
    reads.mockResolvedValue(closed("INSUFFICIENT_PARTICIPANTS"));
    save.mockRejectedValue(new ApiError(409, { code: "ROOM_CLOSED", detail: "이미 마감됐어요." }));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await waitFor(() => expect(screen.getByDisplayValue(raw, { normalizer: value => value })).toHaveAttribute("readonly"));
    expect(screen.queryByRole("button", { name: "조건 제출하기" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledExactlyOnceWith(code, { raw_text: raw.trim() });
  });

  it("does not label an acknowledged save as an unsaved draft when the room closes immediately", async () => {
    const { reads, own, save } = setup(); await typeInitialDraft();
    reads.mockResolvedValue(closed("ANALYZING")); own.mockResolvedValue(saved); save.mockResolvedValue(saved);
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByRole("heading", { name: "모두의 조건을 분석하고 있어요" });
    expect(screen.queryByDisplayValue(raw, { normalizer: value => value })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "임시 수정 버리기" })).not.toBeInTheDocument();
  });

  it("preserves edits made during an acknowledged save if analysis closes the editor", async () => {
    const { reads, save } = setup(); const input = await typeInitialDraft();
    let complete!: (value: SavedSubmission) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const next = "  수요일 저녁으로 바꾼 미저장 합성 조건  ";
    fireEvent.change(input, { target: { value: next } });
    reads.mockResolvedValue(closed("ANALYZING"));
    await act(async () => complete(saved));
    await waitFor(() => expect(screen.getByDisplayValue(next, { normalizer: value => value })).toHaveAttribute("readonly"));
  });

  it.each(["new-owner", "unjoined", 401, 403, 404] as const)("clears the first draft at access boundary %s", async change => {
    const { client, reads } = setup(); await typeInitialDraft();
    if (typeof change === "number") {
      reads.mockRejectedValue(new ApiError(change, { detail: "합성 접근 거부" }));
      await act(async () => { await client.invalidateQueries({ queryKey: ["room", code] }); });
      await screen.findByRole("heading", { name: "모임을 불러오지 못했어요" });
    } else {
      const viewer = change === "unjoined" ? { joined: false, role: null, display_name: null } : { ...host.viewer, context_id: "synthetic-owner-2" };
      await advance(client, reads, { ...closed("INSUFFICIENT_PARTICIPANTS"), viewer });
      if (change === "unjoined") await screen.findByRole("heading", { name: "입력이 마감된 모임이에요" });
    }
    expect(screen.queryByDisplayValue(raw, { normalizer: value => value })).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueryData(["submission", code, host.viewer.context_id!])).toBeUndefined());
    if (typeof change === "number") {
      reads.mockResolvedValue({ ...host, state_version: 2 });
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      await screen.findByRole("heading", { name: host.purpose });
      expect(await screen.findByRole("textbox")).toHaveValue("");
    } else {
      await advance(client, reads, { ...closed("READY"), state_version: 2 });
    }
    expect(screen.queryByDisplayValue(raw, { normalizer: value => value })).not.toBeInTheDocument();
  });

  it("discards the first draft on navigation away and on a real remount", async () => {
    const { reads } = setup(); await typeInitialDraft();
    reads.mockImplementation(async requested => ({ ...host, invite_code: requested, purpose: requested === code ? host.purpose : "합성 다른 모임" }));
    fireEvent.click(screen.getByRole("button", { name: "합성 다른 방" }));
    await screen.findByRole("heading", { name: "합성 다른 모임" });
    expect(screen.queryByDisplayValue(raw, { normalizer: value => value })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "합성 원래 방" }));
    await screen.findByRole("heading", { name: host.purpose });
    expect(screen.queryByDisplayValue(raw, { normalizer: value => value })).not.toBeInTheDocument();
    const beforeRemount = await typeInitialDraft();
    expect(beforeRemount).toHaveValue(raw);
    cleanup(); vi.restoreAllMocks(); setup();
    expect(await screen.findByRole("textbox")).toHaveValue("");
  });
});

describe("independent review: truthful write outcomes", () => {
  it.each([new TypeError("합성 응답 유실"), new ApiError(503, { detail: "합성 프록시 오류" }), new ApiError(408, { detail: "합성 시간 초과" })])("does not declare a failed creation after an unacknowledged response (%s)", async error => {
    const { create } = setup("/create"); create.mockRejectedValue(error);
    await submitCreation();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("방 생성 결과를 확인하지 못했어요.");
    expect(alert).toHaveTextContent("이미 만들어졌을 수 있어요");
    expect(alert).not.toHaveTextContent("방을 만들지 못했어요");
    expect(screen.queryByRole("heading", { name: "모임이 만들어졌어요" })).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a definite creation validation rejection", async () => {
    const { create } = setup("/create"); create.mockRejectedValue(new ApiError(400, { detail: "합성 유효성 거부" }));
    await submitCreation();
    expect(await screen.findByRole("alert")).toHaveTextContent("방 생성 요청이 거절됐어요.");
  });

  it.each([new TypeError("합성 응답 유실"), new ApiError(503, { detail: "합성 프록시 오류" }), new ApiError(408, { detail: "합성 시간 초과" })])("keeps the original input and room when save outcome is unknown (%s)", async error => {
    const { save, create, join } = setup(); await typeInitialDraft(); save.mockRejectedValue(error);
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 결과를 확인하지 못했어요.", { exact: false });
    expect(screen.getByRole("textbox")).toHaveValue(raw);
    expect(screen.queryByText(/아직 내 조건은 제출하지 않았어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "조건 제출을 완료했어요" })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled(); expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not restore a definite unsubmitted claim during an uncertain save retry", async () => {
    const { save } = setup(); await typeInitialDraft();
    let complete!: (value: SavedSubmission) => void;
    save.mockRejectedValueOnce(new TypeError("합성 응답 유실")).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 결과를 확인하지 못했어요.", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    expect(screen.queryByText(/아직 내 조건은 제출하지 않았어요/)).not.toBeInTheDocument();
    await act(async () => complete(saved));
    await screen.findByRole("heading", { name: "조건 제출을 완료했어요" });
  });

  it("resolves an unknown save outcome when a later own read confirms the same text", async () => {
    const { client, own, save, create, join } = setup(); await typeInitialDraft();
    save.mockRejectedValue(new TypeError("합성 응답 유실"));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 결과를 확인하지 못했어요.", { exact: false });
    own.mockResolvedValue(saved);
    await act(async () => { await client.invalidateQueries({ queryKey: ["submission", code] }); });
    await screen.findByRole("heading", { name: "조건 제출을 완료했어요" });
    expect(screen.queryByText(/조건 저장 결과를 확인하지 못했어요/)).not.toBeInTheDocument();
    expect(screen.getByText("저장된 입력 #1")).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled();
  });

  it.each([404, 503])("keeps an unknown outcome when a subsequent own read returns %s", async status => {
    const { client, own, save } = setup(); await typeInitialDraft();
    save.mockRejectedValue(new TypeError("합성 응답 유실"));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 결과를 확인하지 못했어요.", { exact: false });
    own.mockRejectedValue(new ApiError(status, status === 404 ? { code: "SUBMISSION_NOT_FOUND" } : { detail: "합성 조회 실패" }));
    await act(async () => { await client.invalidateQueries({ queryKey: ["submission", code] }); });
    expect(screen.getByText(/조건 저장 결과를 확인하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "조건 제출을 완료했어요" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("confirms the earlier saved text without discarding a newer local draft", async () => {
    const { client, own, save } = setup(); const input = await typeInitialDraft();
    save.mockRejectedValue(new TypeError("합성 응답 유실"));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 결과를 확인하지 못했어요.", { exact: false });
    const next = "  수요일 저녁의 후속 임시 조건  "; fireEvent.change(input, { target: { value: next } });
    own.mockResolvedValue({ ...saved, editable: true });
    await act(async () => { await client.invalidateQueries({ queryKey: ["submission", code] }); });
    await screen.findByText("저장된 입력 #1");
    expect(screen.getByRole("textbox")).toHaveValue(next);
    expect(screen.queryByRole("heading", { name: "조건 제출을 완료했어요" })).not.toBeInTheDocument();
    expect(screen.queryByText(/조건 저장 결과를 확인하지 못했어요/)).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not promise unconditional retry when the server rejects a save", async () => {
    const { save } = setup(); await typeInitialDraft();
    save.mockRejectedValue(new ApiError(400, { detail: "합성 유효성 거부" }));
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByText("조건 저장 요청이 거절됐어요.", { exact: false });
    expect(screen.queryByText(/조건 저장만 다시 시도할 수 있어요/)).not.toBeInTheDocument();
  });
});
