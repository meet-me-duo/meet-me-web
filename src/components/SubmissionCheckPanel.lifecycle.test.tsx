import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";
import * as session from "../auth/session";
import SubmissionCheckPanel from "./SubmissionCheckPanel";

// PS09/11/14/15: public commands/snapshots, independent of cache key internals.
const code = "abcdefghijklmnopqrstuv";
const context = "11111111-1111-4111-8111-111111111111";
const room: Room = { invite_code: code, purpose: "독립 수명 경계", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: context }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
function snapshot(raw_text?: string, revision = 1): SubmissionCheckSnapshot {
  return { candidate: raw_text ? { raw_text, revision, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" } : null, accepted: null,
    check: raw_text ? { id: `22222222-2222-4222-8222-${String(revision).padStart(12, "0")}`, status: "CHECKING", version: 1, retry_allowed: false, failure_code: null, question: null } : null,
    submission_complete: false, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const clients: QueryClient[] = [];
function setup() {
  vi.spyOn(session, "getSessionVersion").mockReturnValue(1);
  const read = vi.spyOn(api, "getSubmissionCheck").mockResolvedValue(snapshot());
  const start = vi.spyOn(api, "startSubmissionCheck").mockResolvedValue(snapshot("최신 입력", 2));
  const cancel = vi.spyOn(api, "cancelSubmissionCheck");
  const changed = vi.fn(); const denied = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const tree = (snapshotRoom = room) => <QueryClientProvider client={client}><SubmissionCheckPanel room={snapshotRoom} onRoomChanged={changed} onAccessDenied={denied} /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, read, start, cancel, changed, denied, rerenderRoom: (next: Room) => view.rerender(tree(next)) };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
async function fillAndSubmit(raw = "최신 입력") { fireEvent.change(await screen.findByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: raw } }); fireEvent.click(screen.getByRole("button", { name: /조건 제출하기/ })); }

describe("#107 independent pre-submit lifecycle fences", () => {
  it("requires GET recovery then an explicit replay with the same UUID/body after lost POST response", async () => {
    const view = setup(); view.start.mockRejectedValue(new TypeError("response lost")); await fillAndSubmit("재전송할 원문");
    await screen.findByText(/결과.*확인하지|저장 여부.*확인|확인.*실패/); const first = view.start.mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole("button", { name: /저장 여부 확인|진행 상태 확인|현재 상태 확인/ }));
    await waitFor(() => expect(view.read.mock.calls.length).toBeGreaterThan(1)); expect(view.start).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: /같은 요청 다시|제출 다시 시도/ }));
    await waitFor(() => expect(view.start).toHaveBeenCalledTimes(2)); expect(view.start.mock.calls[1]?.[1]).toEqual(first);
  });

  it("drops an older GET question that resolves after a newer command snapshot", async () => {
    const view = setup(); await screen.findByRole("textbox", { name: /시간·장소 조건/ });
    const late = deferred<SubmissionCheckSnapshot>(); view.read.mockReturnValueOnce(late.promise);
    const refreshing = view.client.invalidateQueries(); await waitFor(() => expect(view.read).toHaveBeenCalledTimes(2));
    await fillAndSubmit(); await screen.findByText("최신 입력");
    const old = snapshot("낡은 입력", 1); old.check!.status = "NEEDS_CHOICE"; old.check!.question = { id: "33333333-3333-4333-8333-333333333333", text: "낡은 입력의 비공개 질문", source_excerpt: "옛 구절", options: [] };
    await act(async () => { late.resolve(old); await refreshing; });
    expect(screen.queryByText("낡은 입력의 비공개 질문")).not.toBeInTheDocument(); expect(screen.getByText("최신 입력")).toBeInTheDocument();
  });

  it("preserves unsaved local typing when another tab advances the candidate", async () => {
    const view = setup(); const input = await screen.findByRole("textbox", { name: /시간·장소 조건/ });
    fireEvent.change(input, { target: { value: "이 탭의 아직 저장하지 않은 초안" } });
    view.read.mockResolvedValue(snapshot("다른 탭에서 저장된 조건", 3)); await act(async () => { await view.client.invalidateQueries(); });
    await screen.findByText("다른 탭에서 저장된 조건");
    expect(document.body).toHaveTextContent(/다른 탭|최신.*입력|충돌/);
    if (!screen.queryByRole("textbox", { name: /시간·장소 조건/ })) fireEvent.click(screen.getByRole("button", { name: "내 조건 수정" }));
    expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue("이 탭의 아직 저장하지 않은 초안"); expect(view.start).not.toHaveBeenCalled();
  });

  it("does not publish a late mutation callback after leaving the card", async () => {
    const view = setup(); const pending = deferred<SubmissionCheckSnapshot>(); view.start.mockReturnValue(pending.promise); await fillAndSubmit();
    view.changed.mockClear(); view.unmount(); await act(async () => pending.resolve(snapshot("떠난 화면의 비공개 원문", 2)));
    expect(view.changed).not.toHaveBeenCalled(); expect(document.body).not.toHaveTextContent("떠난 화면의 비공개 원문");
  });

  it("does not regress current room state when check response contains an older room snapshot", async () => {
    const view = setup(); const pending = deferred<SubmissionCheckSnapshot>(); view.start.mockReturnValue(pending.promise); await fillAndSubmit();
    view.rerenderRoom({ ...room, state_version: 9, collection_status: "CLOSED", public_status: "ANALYZING", closure_reason: "MANUAL", closed_at: "2026-10-17T10:01:00Z" });
    view.changed.mockClear(); await act(async () => pending.resolve(snapshot("최신 입력", 2)));
    for (const call of view.changed.mock.calls) expect(call[0].state_version).toBeGreaterThanOrEqual(9);
    expect(screen.queryByRole("button", { name: /조건 제출하기|확인 취소|다시 확인/ })).not.toBeInTheDocument();
  });

  it("does not call cancel or display cancelled after an HTTP abort without an explicit server command", async () => {
    const view = setup(); view.start.mockRejectedValue(new DOMException("UI request aborted", "AbortError")); await fillAndSubmit();
    await screen.findByRole("alert"); expect(view.cancel).not.toHaveBeenCalled();
    expect(screen.queryByText(/확인을 취소했어요|확인 취소 완료/)).not.toBeInTheDocument();
    expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
  });

  it("discards current-owner private content on denial and never renders the server's private error detail", async () => {
    const view = setup(); view.start.mockRejectedValue(new ApiError(401, { code: "AUTH_ACCESS_INVALID", detail: "synthetic-private-owner-diagnostic" })); await fillAndSubmit();
    await waitFor(() => expect(view.denied).toHaveBeenCalledTimes(1));
    expect(document.body).not.toHaveTextContent("synthetic-private-owner-diagnostic"); expect(view.cancel).not.toHaveBeenCalled();
  });
});
