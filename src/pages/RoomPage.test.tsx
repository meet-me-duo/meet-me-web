import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room, SavedSubmission, Submission } from "../api/types";
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
