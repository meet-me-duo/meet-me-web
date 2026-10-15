import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Room, SavedSubmission } from "../api/types";
import App from "../App";

const room: Room = {
  invite_code: "abcdefghijklmnopqrstuv", purpose: "생성 후 입력", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-15", search_end_date: "2026-10-29", search_range_source: "DEFAULTED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING",
  viewer: { joined: true, display_name: "주최자", role: "HOST" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};
const saved: SavedSubmission = { raw_text: "화요일 저녁", revision: 1, locale: "ko-KR", created_at: "2026-10-15T00:00:00Z", editable: true };

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function mount(path = "/create") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>);
  return client;
}
async function creationForm() {
  fireEvent.change(screen.getByLabelText("주최자 이름"), { target: { value: "주최자" } });
  fireEvent.change(screen.getByLabelText("모임 목적 / 이름"), { target: { value: room.purpose } });
  fireEvent.click(screen.getByRole("button", { name: /다음 단계/ }));
  const button = await screen.findByRole("button", { name: "방 만들기" });
  return button.closest("form")!;
}
function noSubmission() { vi.spyOn(api, "getSubmission").mockRejectedValue(new ApiError(404, { code: "SUBMISSION_NOT_FOUND" })); }

describe("#22 creation and host submission are separate", () => {
  it("creates without conditions and keeps the successful room and share link when the next read fails", async () => {
    const create = vi.spyOn(api, "createRoom").mockResolvedValue(room);
    vi.spyOn(api, "getRoom").mockRejectedValue(new ApiError(503, { detail: "일시 조회 실패" }));
    noSubmission();
    const save = vi.spyOn(api, "saveSubmission");
    const join = vi.spyOn(api, "joinRoom");
    mount();
    fireEvent.submit(await creationForm());
    await screen.findByRole("heading", { name: "모임이 만들어졌어요" });
    await screen.findByText("모임 상태를 갱신하지 못했어요. 마지막으로 확인한 상태를 보여드려요.");
    expect(screen.getByRole("button", { name: "초대 링크 복사" })).toBeEnabled();
    expect(screen.getByText("아직 내 조건은 제출하지 않았어요.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "나중에 입력하기" })).toHaveAttribute("href", "/");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({ host_display_name: "주최자", purpose: room.purpose, meeting_mode: "EITHER", expected_participants: 4, submission_deadline: null, manual_only: false, search_start_date: null, search_end_date: null });
    expect(save).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled();
  });

  it("locks repeated create events before React renders and releases the lock after creation failure", async () => {
    let reject!: (reason: Error) => void;
    const create = vi.spyOn(api, "createRoom").mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; })).mockResolvedValue(room);
    vi.spyOn(api, "getRoom").mockResolvedValue(room); noSubmission();
    mount(); const form = await creationForm();
    await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => reject(new ApiError(503, { detail: "생성 실패" })));
    expect(await screen.findByRole("alert")).toHaveTextContent("생성 실패");
    fireEvent.submit(form);
    await screen.findByRole("heading", { name: "모임이 만들어졌어요" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries only conditions after a save failure, locks duplicate events and restores completion on revisit", async () => {
    const create = vi.spyOn(api, "createRoom"); const join = vi.spyOn(api, "joinRoom");
    vi.spyOn(api, "getRoom").mockResolvedValue(room); noSubmission();
    let reject!: (reason: Error) => void;
    const save = vi.spyOn(api, "saveSubmission").mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; })).mockResolvedValue(saved);
    mount(`/rooms/${room.invite_code}`);
    fireEvent.click(await screen.findByRole("button", { name: "내 조건 입력하기" }));
    const input = screen.getByRole("textbox"); expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: saved.raw_text } });
    const button = screen.getByRole("button", { name: "조건 제출하기" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(async () => reject(new ApiError(503, { detail: "제출 실패" })));
    await screen.findByText("제출 실패");
    expect(input).toHaveValue(saved.raw_text);
    expect(screen.getByRole("button", { name: "초대 링크 복사" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await screen.findByRole("heading", { name: "조건 제출을 완료했어요" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls).toEqual([[room.invite_code, { raw_text: saved.raw_text }], [room.invite_code, { raw_text: saved.raw_text }]]);
    expect(create).not.toHaveBeenCalled(); expect(join).not.toHaveBeenCalled();
    cleanup(); vi.mocked(api.getSubmission).mockResolvedValue(saved);
    mount(`/rooms/${room.invite_code}`);
    await screen.findByRole("heading", { name: "조건 제출을 완료했어요" });
    expect(screen.queryByRole("heading", { name: "모임이 만들어졌어요" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2); expect(join).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", null] as const)("does not show HOST onboarding to role %s", async role => {
    vi.spyOn(api, "getRoom").mockResolvedValue({ ...room, viewer: { ...room.viewer, joined: role !== null, role } });
    noSubmission(); mount(`/rooms/${room.invite_code}`);
    await screen.findByRole("heading", { name: role ? "가능한 조건을 알려주세요" : room.purpose });
    expect(screen.queryByRole("heading", { name: "모임이 만들어졌어요" })).not.toBeInTheDocument();
  });
});
