import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Candidate, Room, Submission } from "../api/types";
import * as accountHook from "../auth/useAccount";
import * as accountSession from "../auth/session";
import RoomPage from "./RoomPage";

// Independent #108 acceptance tests. Expectations come from the agreed public
// API/UI contracts, not from GuestAccessPanel or RoomPage implementation details.
const code = "abcdefghijklmnopqrstuv";
const otherCode = "zyxwvutsrqponmlkjihgfe";
const participantOne = "11111111-1111-4111-8111-111111111111";
const participantTwo = "22222222-2222-4222-8222-222222222222";
const oldContext = "33333333-3333-4333-8333-333333333333";
const restoredContext = "44444444-4444-4444-8444-444444444444";
const account: accountSession.AuthSession = {
  accessToken: "synthetic-account-access",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  account: { id: "55555555-5555-4555-8555-555555555555", displayName: "로그인 회원" },
};
const publicRoom: Room = {
  invite_code: code, purpose: "독립 비회원 재접근 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: null, manual_only: false,
  collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING",
  state_version: 1,
  viewer: { joined: false, display_name: null, role: null }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};
const guestRecords = { records: [
  { participant_id: participantOne, display_name: "민수" },
  { participant_id: participantTwo, display_name: "민수" },
] };
const candidate: Candidate = {
  candidate_id: "66666666-6666-4666-8666-666666666666", plan_type: "A", meeting_mode: "REMOTE", rank: 1,
  attendance_count: 2, total_participants: 2, place: null, summary: "확정 읽기 검증",
  time_ranges: [{ start_at: "2026-10-18T04:00:00Z", end_at: "2026-10-18T05:00:00Z" }],
};
function own(raw_text = "암호로 복원한 본인의 조건"): Submission {
  return { raw_text, revision: 1, editable: true, locale: "ko-KR", created_at: "2026-10-17T10:00:00Z" };
}
function joined(snapshot: Room = publicRoom): Room {
  return { ...snapshot, viewer: { joined: true, display_name: "민수", role: "MEMBER", context_id: restoredContext } };
}
function closed(status: "INSUFFICIENT_PARTICIPANTS" | "CONFIRMED"): Room {
  return { ...publicRoom, collection_status: "CLOSED", public_status: status, closure_reason: "MANUAL", closed_at: "2026-10-17T10:00:00Z" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/rooms/${otherCode}`)}>독립 다른 모임으로 이동</button>;
}
const clients: QueryClient[] = [];
function setup(snapshot: Room = publicRoom, loggedIn: accountSession.AuthSession | null = null) {
  const session = vi.spyOn(accountHook, "useAccountSession").mockReturnValue(loggedIn);
  const getSession = vi.spyOn(accountSession, "getSession").mockReturnValue(loggedIn);
  const sessionVersion = vi.spyOn(accountSession, "getSessionVersion").mockReturnValue(0);
  const reads = vi.spyOn(api, "getRoom").mockResolvedValue(snapshot);
  const ownRead = vi.spyOn(api, "getSubmission").mockResolvedValue(own());
  const records = vi.spyOn(api, "getGuestRecords").mockResolvedValue(guestRecords);
  const reaccess = vi.spyOn(api, "reaccessGuest").mockResolvedValue({ participant_id: participantTwo, level: "VERIFIED_GUEST" });
  const replace = vi.spyOn(api, "replaceGuestSubmission").mockResolvedValue({ replaced: true });
  const join = vi.spyOn(api, "joinRoom").mockResolvedValue(joined(snapshot));
  const save = vi.spyOn(api, "saveSubmission");
  vi.spyOn(api, "getCandidates").mockResolvedValue({ quality: "COMPLETE", candidates: [candidate], applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0 });
  vi.spyOn(api, "getResult").mockResolvedValue({ candidate, confirmed_at: "2026-10-17T10:00:00Z" });
  vi.spyOn(api, "getUnappliedInputs").mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><Navigation /><Routes><Route path="/rooms/:inviteCode" element={<RoomPage />} /></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, reads, ownRead, records, reaccess, replace, join, save, session, getSession, sessionVersion, refreshRender: () => view.rerender(tree()) };
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); localStorage.clear(); });
async function access(password?: string) {
  const select = await screen.findByRole("combobox", { name: "다시 접근할 참여 기록" });
  await screen.findByRole("option", { name: new RegExp(`민수.*${participantTwo}`) });
  fireEvent.change(select, { target: { value: participantTwo } });
  if (password !== undefined) fireEvent.change(screen.getByLabelText("기록 암호 (선택)"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "기록에 다시 접근" }));
}
async function settle() { await act(async () => { await Promise.resolve(); await new Promise<void>(resolve => setTimeout(resolve, 0)); }); }

describe("#108 RoomPage joins through the selected identity", () => {
  it.each([undefined, " keep password spaces "])("joins a guest with a name and optional password %s", async password => {
    const view = setup();
    const name = await screen.findByLabelText("이름", { exact: true });
    fireEvent.change(name, { target: { value: "  민수  " } });
    if (password !== undefined) fireEvent.change(screen.getByLabelText("참여 암호 (선택)"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    await waitFor(() => expect(view.join).toHaveBeenCalledTimes(1));
    expect(view.join.mock.calls[0]?.[0]).toBe(code);
    expect(view.join.mock.calls[0]?.[1]).toBe("민수");
    expect(view.join.mock.calls[0]?.[2]).toBe(password);
    await screen.findByText("민수님이 참여한 모임");
  });

  it("joins an authenticated account without guest name or password fields", async () => {
    const view = setup(publicRoom, account);
    fireEvent.click(await screen.findByRole("button", { name: "계정으로 참여" }));
    await waitFor(() => expect(view.join).toHaveBeenCalledTimes(1));
    expect(view.join.mock.calls[0]?.[0]).toBe(code);
    expect(view.join.mock.calls[0]?.[1]).toBeUndefined();
    expect(view.join.mock.calls[0]?.[2]).toBeUndefined();
    expect(screen.queryByLabelText("이름", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/암호/)).not.toBeInTheDocument();
  });
});

describe("#108 RoomPage verified access restores only the server-authorized viewer", () => {
  it("uses an explicit duplicate-name ID and purges prior private caches before re-reading the restored viewer", async () => {
    const view = setup();
    await screen.findByRole("combobox", { name: "다시 접근할 참여 기록" });
    expect(await screen.findByRole("option", { name: new RegExp(`민수.*${participantOne}`) })).toHaveValue(participantOne);
    await screen.findByRole("option", { name: new RegExp(`민수.*${participantTwo}`) });
    const oldText = "이전 소유자만 볼 수 있는 오래된 원문";
    const staleKeys = [
      ["submission", code], ["submission", code, oldContext], ["unapplied", code], ["candidates", code], ["result", code],
    ];
    for (const key of staleKeys) view.client.setQueryData(key, { privateText: oldText });
    const otherPrivate = { privateText: "다른 방의 비공개 캐시" };
    view.client.setQueryData(["submission", otherCode], otherPrivate);
    view.reads.mockImplementation(async () => {
      for (const key of staleKeys) expect(view.client.getQueryData(key)).toBeUndefined();
      return joined();
    });
    await access("valid-password");
    await waitFor(() => expect(view.reaccess).toHaveBeenCalledTimes(1));
    expect(view.reaccess).toHaveBeenCalledWith(code, { participant_id: participantTwo, password: "valid-password" });
    await screen.findByText("민수님이 참여한 모임");
    await screen.findByText("암호로 복원한 본인의 조건");
    expect(view.reads.mock.calls.length).toBeGreaterThan(1);
    expect(view.client.getQueryData<Room>(["room", code])?.viewer.context_id).toBe(restoredContext);
    expect(view.client.getQueryData(["submission", otherCode])).toEqual(otherPrivate);
    expect(screen.queryByText(oldText)).not.toBeInTheDocument();
    expect(view.join).not.toHaveBeenCalled();
    expect(view.replace).not.toHaveBeenCalled();
  });

  it("keeps wrong-password response details private and never reads or replaces the original", async () => {
    const view = setup();
    view.reaccess.mockRejectedValue(new ApiError(403, { code: "GUEST_ACCESS_DENIED", detail: "private-password-hash participant-exists internal-retry-count" }));
    await access("wrong-password");
    await screen.findByRole("alert");
    expect(document.body).not.toHaveTextContent(/private-password-hash|participant-exists|internal-retry-count|wrong-password/);
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveValue("");
    expect(view.ownRead).not.toHaveBeenCalled();
    expect(view.replace).not.toHaveBeenCalled();
    expect(view.client.getQueryData<Room>(["room", code])?.viewer.joined).toBe(false);
    expect(screen.queryByLabelText("새 참여 조건")).not.toBeInTheDocument();
  });

  it("cancels in-flight private reads so late former-owner content cannot reappear after verification", async () => {
    const view = setup();
    await screen.findByRole("combobox", { name: "다시 접근할 참여 기록" });
    const pending = deferred<Submission>();
    let oldSignal: AbortSignal | undefined;
    const staleRead = view.client.fetchQuery({
      queryKey: ["submission", code, oldContext],
      queryFn: ({ signal }) => { oldSignal = signal; return pending.promise; },
    }).catch(() => undefined);
    await waitFor(() => expect(oldSignal).toBeDefined());
    view.reads.mockResolvedValue(joined());
    await access("valid-password");
    await screen.findByText("암호로 복원한 본인의 조건");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { pending.resolve(own("늦게 도착한 다른 소유자 원문")); await staleRead; });
    expect(view.client.getQueryData(["submission", code, oldContext])).toBeUndefined();
    expect(screen.queryByText("늦게 도착한 다른 소유자 원문")).not.toBeInTheDocument();
  });
});

describe("#108 RoomPage unprotected access grants replacement without disclosure", () => {
  it("starts blank, survives an unjoined room refresh, and only replaces after an explicit action", async () => {
    const view = setup();
    view.reaccess.mockResolvedValue({ participant_id: participantTwo, level: "REPLACE_ONLY" });
    await access();
    const input = await screen.findByLabelText("새 참여 조건");
    expect(input).toHaveValue("");
    expect(view.ownRead).not.toHaveBeenCalled();
    expect(view.replace).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "새로 입력한 금요일 오후 조건" } });
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["room", code] }); });
    expect(screen.getByLabelText("새 참여 조건")).toHaveValue("새로 입력한 금요일 오후 조건");
    fireEvent.click(screen.getByRole("button", { name: "기존 조건 대체하기" }));
    await waitFor(() => expect(view.replace).toHaveBeenCalledExactlyOnceWith(code, participantTwo, { raw_text: "새로 입력한 금요일 오후 조건" }));
    await settle();
    expect(view.ownRead).not.toHaveBeenCalled();
    expect(view.save).not.toHaveBeenCalled();
    expect(view.client.getQueryData<Room>(["room", code])?.viewer.joined).toBe(false);
    expect(screen.queryByText("암호로 복원한 본인의 조건")).not.toBeInTheDocument();
  });

  it("does not send a duplicate replacement while the first request is unresolved", async () => {
    const view = setup();
    view.reaccess.mockResolvedValue({ participant_id: participantTwo, level: "REPLACE_ONLY" });
    const pending = deferred<{ replaced: true }>(); view.replace.mockReturnValue(pending.promise);
    await access();
    fireEvent.change(await screen.findByLabelText("새 참여 조건"), { target: { value: "주말 가능" } });
    const save = screen.getByRole("button", { name: "기존 조건 대체하기" });
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(view.replace).toHaveBeenCalledTimes(1));
    expect(save).toBeDisabled();
    await act(async () => pending.resolve({ replaced: true }));
    expect(view.ownRead).not.toHaveBeenCalled();
  });

  it("blocks an already-open replacement editor when the room closes", async () => {
    const view = setup();
    view.reaccess.mockResolvedValue({ participant_id: participantTwo, level: "REPLACE_ONLY" });
    await access();
    fireEvent.change(await screen.findByLabelText("새 참여 조건"), { target: { value: "마감 뒤 저장되면 안 되는 조건" } });
    view.reads.mockResolvedValue({ ...closed("INSUFFICIENT_PARTICIPANTS"), state_version: 2 });
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["room", code] }); });
    await waitFor(() => expect(view.client.getQueryData<Room>(["room", code])?.collection_status).toBe("CLOSED"));
    const save = screen.queryByRole("button", { name: "기존 조건 대체하기" });
    if (save) { expect(save).toBeDisabled(); fireEvent.click(save); }
    expect(view.replace).not.toHaveBeenCalled();
    expect(view.ownRead).not.toHaveBeenCalled();
  });
});

describe("#108 closed and confirmed rooms keep read access without reopening edits", () => {
  it.each(["INSUFFICIENT_PARTICIPANTS", "CONFIRMED"] as const)("allows password-based read restoration in %s", async status => {
    const snapshot = closed(status); const view = setup(snapshot);
    view.reads.mockResolvedValue(joined(snapshot));
    await access("valid-password");
    await screen.findByText("민수님이 참여한 모임");
    // Closed-room originals retain the existing explicit disclosure boundary.
    expect(view.ownRead).not.toHaveBeenCalled();
    const disclosure = await screen.findByText("내 저장 입력 확인", { exact: true });
    const details = disclosure.closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(view.ownRead).toHaveBeenCalled());
    await screen.findByText("암호로 복원한 본인의 조건");
    expect(view.join).not.toHaveBeenCalled(); expect(view.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "내 조건 수정" })).not.toBeInTheDocument();
  });

  it.each(["INSUFFICIENT_PARTICIPANTS", "CONFIRMED"] as const)("rejects new joins and replacements in %s", async status => {
    const view = setup(closed(status));
    view.reaccess.mockResolvedValue({ participant_id: participantTwo, level: "REPLACE_ONLY" });
    await access(); await settle();
    for (const name of ["참여하기", "기존 조건 대체하기"]) {
      const button = screen.queryByRole("button", { name });
      if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
    }
    expect(view.join).not.toHaveBeenCalled(); expect(view.replace).not.toHaveBeenCalled(); expect(view.ownRead).not.toHaveBeenCalled();
  });
});

describe("#108 stale reaccess results cannot cross room or account boundaries", () => {
  it.each(["VERIFIED_GUEST", "REPLACE_ONLY"] as const)("ignores a %s response after navigation", async level => {
    const view = setup();
    const pending = deferred<{ participant_id: string; level: typeof level }>(); view.reaccess.mockReturnValue(pending.promise);
    await access("old-room-password");
    const next = { ...publicRoom, invite_code: otherCode, purpose: "독립 새 모임" };
    view.reads.mockImplementation(async inviteCode => inviteCode === otherCode ? next : publicRoom);
    fireEvent.click(screen.getByRole("button", { name: "독립 다른 모임으로 이동" }));
    await screen.findByText(next.purpose);
    const count = view.reads.mock.calls.length;
    await act(async () => pending.resolve({ participant_id: participantTwo, level })); await settle();
    expect(view.reads).toHaveBeenCalledTimes(count);
    expect(screen.queryByLabelText("새 참여 조건")).not.toBeInTheDocument();
    expect(view.ownRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveValue("");
    expect(view.client.getQueryData<Room>(["room", otherCode])?.viewer.joined).toBe(false);
  });

  it("ignores old guest verification when a member logs in before it resolves", async () => {
    const view = setup();
    const pending = deferred<{ participant_id: string; level: "VERIFIED_GUEST" }>(); view.reaccess.mockReturnValue(pending.promise);
    await access("old-guest-password");
    view.session.mockReturnValue(account); view.getSession.mockReturnValue(account); view.sessionVersion.mockReturnValue(1);
    view.refreshRender();
    await screen.findByRole("button", { name: "계정으로 참여" });
    await settle();
    const count = view.reads.mock.calls.length;
    await act(async () => pending.resolve({ participant_id: participantTwo, level: "VERIFIED_GUEST" })); await settle();
    expect(view.reads).toHaveBeenCalledTimes(count);
    expect(view.ownRead).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/암호/)).not.toBeInTheDocument();
    expect(view.client.getQueryData<Room>(["room", code])?.viewer.joined).toBe(false);
  });
});
