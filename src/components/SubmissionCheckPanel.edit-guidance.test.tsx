import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import * as session from "../auth/session";
import { viewerContext } from "../api/recovery";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// Generated required nullable field, with backward compatibility for older servers.
const room: Room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "수정 안내 합성", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
const raw = "주말 저녁 비대면으로 가능해요";
const fallback = "원문은 저장됐지만 확인을 완료하지 못했어요. 조건을 직접 수정해 주세요.";
const version = { raw_text: raw, revision: 1, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" };
function snapshot(guidance?: unknown): SubmissionCheckSnapshot {
  const check = { id: "22222222-2222-4222-8222-222222222222", status: "NEEDS_EDIT" as const, version: 1, retry_allowed: false, failure_code: null, question: null };
  if (guidance !== undefined) Object.assign(check, { edit_guidance: guidance });
  return { candidate: version, accepted: null, check, submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null };
}
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
function mount(value = snapshot(), target = room) {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(value);
  const start = vi.spyOn(api, "startSubmissionCheck");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SubmissionCheckPanel room={target} onRoomChanged={vi.fn()} onAccessDenied={vi.fn()} /></QueryClientProvider>);
  return start;
}

it("shows server-provided guidance as plain text, retaining raw input and explicit edit intent", async () => {
  const text = '오전인지 오후인지 적어 주세요.\n<img src=x onerror="alert(1)"><script>ignored()</script>';
  const start = mount(snapshot(text));
  const message = await screen.findByText(text, { normalizer: value => value.trim() });
  expect(message).toHaveAttribute("role", "status");
  expect(message.querySelector("img,script,a")).toBeNull();
  expect(screen.queryByText(fallback)).not.toBeInTheDocument();
  expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /선택한 내용으로 확인/ })).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "내 조건 수정" }));
  expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(raw);
  expect(screen.queryByText(text, { normalizer: value => value.trim() })).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
});

it.each([undefined, null, "", " \n ", 42, { text: "not a string" }, "가".repeat(161), "😀".repeat(161)])("keeps the old-server fallback for absent or invalid guidance: %s", async guidance => {
  mount(snapshot(guidance));
  await screen.findByText(fallback);
  expect(screen.getByText(raw, { exact: true })).toBeInTheDocument();
});

it.each(["가".repeat(160), "😀".repeat(160)])("shows a 160-codepoint guidance intact with no A/B question or automatic command", async guidance => {
  const value = snapshot(guidance);
  expect(value.check?.question).toBeNull();
  const start = mount(value);
  const message = await screen.findByText(guidance);
  expect(message.textContent?.trim()).toBe(guidance);
  expect(screen.queryByRole("button", { name: /선택한 내용으로 확인|직접 수정/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "내 조건 수정" })).toBeEnabled();
  expect(start).not.toHaveBeenCalled();
});

it("does not reuse NEEDS_EDIT guidance after cancellation", async () => {
  const text = "날짜 범위를 직접 적어 주세요.";
  mount(snapshot(text)); await screen.findByText(text);
  await act(async () => { client!.setQueryData(["submission-check", room.invite_code, viewerContext(room), 1], { ...snapshot(text), check: { ...snapshot(text).check!, status: "CANCELLED", version: 2 } }); });
  await screen.findByText(/확인을 취소했어요/);
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.getByText(/확인을 취소했어요/)).toBeInTheDocument();
});

it("keeps an A/B choice question separate from retained edit guidance", async () => {
  const text = "직접 수정 안내를 A/B 질문으로 해석하지 마세요.";
  const value = snapshot(text);
  value.check!.status = "NEEDS_CHOICE";
  value.check!.question = { id: "33333333-3333-4333-8333-333333333333", text: "오전과 오후 중 언제인가요?", source_excerpt: "저녁", options: [
    { id: "AM", text: "오전", proposed_text: "주말 오전 비대면 가능" },
    { id: "PM", text: "오후", proposed_text: "주말 오후 비대면 가능" },
  ] };
  const start = mount(value);
  await screen.findByRole("heading", { name: "오전과 오후 중 언제인가요?" });
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "오전" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "오후" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "선택한 내용으로 확인" })).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
});

it("hides guidance when collection is closed without inferring a cause", async () => {
  const text = "날짜 범위를 직접 적어 주세요.";
  mount(snapshot(text), { ...room, collection_status: "CLOSED" });
  await screen.findByText(raw, { exact: true });
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.queryByText(fallback)).not.toBeInTheDocument();
});
