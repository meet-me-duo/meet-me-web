import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, SavedSubmission, Submission } from "../api/types";
import RoomPage from "./RoomPage";

const room: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "조건 제출 테스트", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-09-21", search_end_date: "2026-09-28", search_range_source: "DEFAULTED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING",
  viewer: { joined: true, display_name: "지수", role: "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};
function submission(raw_text: string, revision?: number): SavedSubmission;
function submission(raw_text: null, revision?: number): Submission;
function submission(raw_text: string | null, revision = 1): Submission {
  return { raw_text, revision, locale: "ko-KR", created_at: "2026-09-20T12:00:00Z", editable: true };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${room.invite_code}`]}><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

describe("natural-language conditions screen", () => {
  it("blocks blank and over-limit text, accepts 500 emoji and submits only trimmed raw_text", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" }));
    const save = vi.spyOn(api, "saveSubmission").mockResolvedValue(submission("😀".repeat(500), 2));
    mount();
    const input = await screen.findByRole("textbox");
    const button = screen.getByRole("button", { name: "조건 제출하기" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("maxlength");
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: " \u00a0\ufeff " } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "😀".repeat(501) } });
    expect(button).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: ` \u00a0${"😀".repeat(500)}\ufeff ` } });
    expect(screen.getByText("500/500")).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith(room.invite_code, { raw_text: "😀".repeat(500) }));
    await screen.findByText("조건이 안전하게 저장됐어요.");
  });

  it("loads legacy null safely without saving, then creates a natural-language revision", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValue(submission(null));
    const save = vi.spyOn(api, "saveSubmission").mockResolvedValue(submission("월요일  저녁", 2));
    mount();
    const input = await screen.findByRole("textbox");
    await screen.findByText(/기존 시간표 입력은 보존/);
    expect(input).toHaveValue("");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "  월요일  저녁  " } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(room.invite_code, { raw_text: "월요일  저녁" }));
    await screen.findByText("저장된 입력 #2");
    expect(screen.queryByText(/기존 시간표 입력은 보존/)).not.toBeInTheDocument();
  });

  it("restores existing natural language and leaves it intact when saving fails", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValue(submission("화요일 저녁"));
    vi.spyOn(api, "saveSubmission").mockRejectedValue(new ApiError(400, { code: "SUBMISSION_TEXT_TOO_LONG" }));
    mount();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveValue("화요일 저녁"));
    fireEvent.change(input, { target: { value: "목요일 저녁" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await screen.findByText(/500자 이하로 입력/);
    expect(input).toHaveValue("목요일 저녁");
    expect(screen.getByText("저장된 입력 #1")).toBeInTheDocument();
  });
});

describe("saved conditions and plan accuracy", () => {
  it("marks edits unsaved, restores saved status on undo, and avoids saving unchanged text", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValue(submission("화요일 저녁"));
    const save = vi.spyOn(api, "saveSubmission");
    mount();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveValue("화요일 저녁"));
    expect(screen.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
    expect(screen.getByText("조건이 안전하게 저장됐어요.")).toBeInTheDocument();
    expect(screen.getByText(/저장은 분석 완료를 뜻하지 않아요/)).toBeInTheDocument();
    expect(screen.getByText(/반영하지 못한 원문은 주최자에게 공개/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "목요일 저녁" } });
    expect(screen.queryByText("조건이 안전하게 저장됐어요.")).not.toBeInTheDocument();
    expect(screen.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "  화요일 저녁  " } });
    expect(screen.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
    expect(screen.getByText("조건이 안전하게 저장됐어요.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps a successful save distinct from a failed room refresh and retries only the refresh", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValueOnce(room).mockRejectedValueOnce(new ApiError(503, { code: "SERVICE_UNAVAILABLE" })).mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValue(submission("화요일 저녁"));
    const save = vi.spyOn(api, "saveSubmission").mockResolvedValue(submission("목요일 저녁", 2));
    mount();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveValue("화요일 저녁"));
    fireEvent.change(input, { target: { value: "목요일 저녁" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await screen.findByText("조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.");
    expect(screen.getByText("조건이 안전하게 저장됐어요.")).toBeInTheDocument();
    expect(screen.getByText("저장된 입력 #2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "진행 상태 다시 확인" }));
    await waitFor(() => expect(screen.queryByText("조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.")).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("preserves text edited while saving and labels it unsaved after the earlier request succeeds", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValue(submission("화요일 저녁"));
    let complete!: (value: SavedSubmission) => void;
    const save = vi.spyOn(api, "saveSubmission").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    mount();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveValue("화요일 저녁"));
    fireEvent.change(input, { target: { value: "목요일 저녁" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(room.invite_code, { raw_text: "목요일 저녁" }));
    fireEvent.change(input, { target: { value: "금요일 저녁" } });
    complete(submission("목요일 저녁", 2));
    await screen.findByText("저장된 입력 #2");
    expect(input).toHaveValue("금요일 저녁");
    expect(screen.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeInTheDocument();
    expect(screen.queryByText("조건이 안전하게 저장됐어요.")).not.toBeInTheDocument();
  });

  it("preserves unsaved text when a submission refetch brings a newer saved revision", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue(room);
    vi.spyOn(api, "getSubmission").mockResolvedValueOnce(submission("화요일 저녁")).mockResolvedValue(submission("목요일 저녁", 2));
    const client = mount();
    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveValue("화요일 저녁"));
    fireEvent.change(input, { target: { value: "금요일 저녁" } });
    await client.invalidateQueries({ queryKey: ["submission", room.invite_code] });
    await screen.findByText("저장된 입력 #2");
    expect(input).toHaveValue("금요일 저녁");
    expect(screen.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeInTheDocument();
  });

  const candidate: Candidate = {
    candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "IN_PERSON", rank: 1,
    attendance_count: 2, total_participants: 3, place: { display_name: "봉천역 근처", latitude: null, longitude: null }, summary: "화요일 저녁 후보",
    time_ranges: [{ start_at: "2026-10-06T10:00:00Z", end_at: "2026-10-06T12:00:00Z" }, { start_at: "2026-10-13T10:00:00Z", end_at: "2026-10-13T12:00:00Z" }],
  };

  it("shows partial coverage and a candidate limitation by the host selection action", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...room, public_status: "READY_WITH_WARNINGS", viewer: { ...room.viewer, role: "HOST" } });
    vi.spyOn(api, "getCandidates").mockResolvedValue({ quality: "PARTIAL", applied_submissions: 2, total_submissions: 3, unapplied_inputs: 1, candidates: [candidate] });
    vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([{ participant_display_name: "다른 참여자", raw_text: "조건 원문", reason: "AMBIGUOUS_TIME_CONSTRAINT" }]);
    mount();
    await screen.findByRole("heading", { name: "일부 조건으로 만든 후보 플랜이에요" });
    const select = screen.getByRole("button", { name: "Plan A 선택" });
    const card = select.closest("article")!;
    expect(card).toHaveTextContent("2/3개 입력 반영");
    expect(card).toHaveTextContent("실제 모임 날짜·시간과 상세 장소는 주최자가 따로 공지해요.");
    expect(screen.getByText(/반영되지 않은 입력 1개 확인/).compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card).toHaveTextContent("후보 지역 · 봉천역 근처");
    expect(select).toBeEnabled();
  });

  it("has no selection instruction or action when the candidate list is empty", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...room, public_status: "READY_WITH_WARNINGS" });
    vi.spyOn(api, "getCandidates").mockResolvedValue({ quality: "PARTIAL", applied_submissions: 2, total_submissions: 3, unapplied_inputs: 1, candidates: [] });
    const originals = vi.spyOn(api, "getUnappliedInputs");
    mount();
    await screen.findByRole("heading", { name: "선택할 수 있는 후보가 없어요" });
    expect(screen.queryByText(/하나를 골라|플랜 하나를 선택|플랜을 선택하면/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plan .* 선택/ })).not.toBeInTheDocument();
    expect(originals).not.toHaveBeenCalled();
  });

  it("calls the confirmed result a selected plan and retains every candidate time", async () => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...room, public_status: "CONFIRMED" });
    vi.spyOn(api, "getResult").mockResolvedValue({ candidate, confirmed_at: "2026-10-05T09:00:00Z" });
    mount();
    await screen.findByRole("heading", { name: "주최자가 선택한 플랜이에요" });
    expect(screen.getByText("선택한 플랜", { exact: true })).toBeInTheDocument();
    expect(document.querySelectorAll(".time-options span")).toHaveLength(2);
    expect(screen.queryByText(/최종 확정된 일정|우리의 만남이 정해졌어요/)).not.toBeInTheDocument();
  });
});
