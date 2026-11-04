import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as session from "./session";
import { AccountArchive } from "./AccountHistoryPage";
import { api, ApiError } from "../api/client";
import type { AccountRoomRecord, AccountRoomsResponse } from "../api/accountRooms";

const row = (letter: string, purpose: string, role: "HOST" | "MEMBER" = "HOST"): AccountRoomRecord => ({ invite_code: letter.repeat(22), purpose, role, created_at: "2026-10-27T15:00:00Z", expires_at: "2026-11-27T15:00:00Z" });
const body = (rooms: AccountRoomRecord[], next: string | null = null): AccountRoomsResponse => ({ rooms, has_more: next !== null, next_cursor: next });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const clients: QueryClient[] = [];
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client); return render(<QueryClientProvider client={client}><MemoryRouter><AccountArchive /></MemoryRouter></QueryClientProvider>); }
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "조회" }));

describe("account-based room history", () => {
  it("defaults to all owned/participated rooms, identifies roles, and labels creation/retention dates", async () => {
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([row("a", "내 주최 모임"), row("b", "내 참여 모임", "MEMBER")]));
    mount(); await screen.findByRole("link", { name: /내 참여 모임/ });
    expect(screen.getByRole("radio", { name: "전체" })).toBeChecked();
    expect(get).toHaveBeenCalledWith({}, undefined, expect.any(AbortSignal));
    expect(screen.getByRole("status")).toHaveTextContent("전체 · 불러온 모임 2개");
    expect(screen.getByText(/모임 생성일 기준 · 한국 시간/)).toBeInTheDocument();
    expect(screen.queryByText("정리 예정")).not.toBeInTheDocument();
    expect(document.querySelector(".account-history-created")).toHaveTextContent("생성 2026. 10. 28.");
    expect(screen.getAllByText(/생성/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /내 주최 모임/ })).toHaveAttribute("href", `/rooms/${"a".repeat(22)}`);
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });
  it("applies trimmed name and inclusive creation dates with MEMBER, hiding previous results while fetching", async () => {
    const next = deferred<AccountRoomsResponse>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "이전 조건 모임")])).mockReturnValueOnce(next.promise);
    mount(); await screen.findByRole("link", { name: /이전 조건 모임/ });
    fireEvent.click(screen.getByRole("radio", { name: "참여" }));
    fireEvent.change(screen.getByLabelText("생성일 시작"), { target: { value: "2026-10-28" } });
    fireEvent.change(screen.getByLabelText("생성일 종료"), { target: { value: "2026-10-28" } });
    fireEvent.change(screen.getByLabelText("모임 이름"), { target: { value: "  팀 회의  " } }); submit();
    await waitFor(() => expect(get).toHaveBeenLastCalledWith({ role: "MEMBER", created_from: "2026-10-28", created_to: "2026-10-28", query: "팀 회의" }, undefined, expect.any(AbortSignal)));
    expect(screen.queryByRole("link", { name: /이전 조건 모임/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("모임 이름")).toHaveValue("  팀 회의  ");
    await act(async () => next.resolve(body([row("b", "팀 회의", "MEMBER")])));
    expect(await screen.findByRole("link", { name: /팀 회의/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("참여 · 불러온 모임 1개");
  });
  it("validates range order and Unicode length without fetching, accepts 100 codepoints and a one-sided date", async () => {
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([])); mount(); await screen.findByRole("radio", { name: "전체" });
    fireEvent.change(screen.getByLabelText("생성일 시작"), { target: { value: "2026-10-29" } });
    fireEvent.change(screen.getByLabelText("생성일 종료"), { target: { value: "2026-10-28" } }); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("종료일은 시작일보다 빠를 수 없어요"); expect(get).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("생성일 시작"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("모임 이름"), { target: { value: "😀".repeat(101) } }); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("100자 이내"); expect(screen.getByLabelText("모임 이름")).toHaveFocus(); expect(get).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("모임 이름"), { target: { value: `  ${"😀".repeat(100)}  ` } }); submit();
    await waitFor(() => expect(get).toHaveBeenLastCalledWith({ created_to: "2026-10-28", query: "😀".repeat(100) }, undefined, expect.any(AbortSignal)));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("paginates only on explicit action, keeps the opaque cursor, and resets to the first page after filter change", async () => {
    const pending = deferred<AccountRoomsResponse>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "첫 모임")], "opaque+/_=cursor")).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(body([row("c", "주최 필터 결과")]));
    mount(); await screen.findByRole("link", { name: /첫 모임/ }); expect(get).toHaveBeenCalledTimes(1);
    const more = screen.getByRole("button", { name: "더 보기" });
    act(() => { fireEvent.click(more); fireEvent.click(more); });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get).toHaveBeenLastCalledWith({}, "opaque+/_=cursor", expect.any(AbortSignal));
    await act(async () => pending.resolve(body([row("b", "다음 모임", "MEMBER")])));
    await screen.findByRole("link", { name: /다음 모임/ }); expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "주최" })); submit();
    await screen.findByRole("link", { name: /주최 필터 결과/ });
    expect(get).toHaveBeenLastCalledWith({ role: "HOST" }, undefined, expect.any(AbortSignal));
    expect(screen.queryByRole("link", { name: /다음 모임/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith({}, undefined, expect.any(AbortSignal)));
    expect(screen.getByRole("radio", { name: "전체" })).toBeChecked();
  });
  it("preserves loaded rows on a failed next page and retries that cursor only after an explicit action", async () => {
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "보존할 모임")], "next")).mockRejectedValueOnce(new ApiError(503, { code: "AUTH_UNAVAILABLE", detail: "잠시 후 다시 조회해 주세요." })).mockResolvedValueOnce(body([row("b", "재시도 모임")]));
    mount(); await screen.findByRole("link", { name: /보존할 모임/ }); fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await screen.findByRole("alert"); expect(get).toHaveBeenCalledTimes(2); expect(screen.getByRole("link", { name: /보존할 모임/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 모임 다시 불러오기" }));
    await screen.findByRole("link", { name: /재시도 모임/ }); expect(get).toHaveBeenLastCalledWith({}, "next", expect.any(AbortSignal));
  });
  it("hides previously loaded rows after a next-page authorization denial", async () => {
    vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "이전 계정 모임")], "next")).mockRejectedValueOnce(new ApiError(403, { code: "FORBIDDEN", detail: "접근할 수 없어요." }));
    mount(); await screen.findByRole("link", { name: /이전 계정 모임/ }); fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("접근할 수 없어요");
    expect(screen.queryByRole("link", { name: /이전 계정 모임/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });
  it("ignores a late result for old filters and shows only the applied filter's rows", async () => {
    const member = deferred<AccountRoomsResponse>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([])).mockReturnValueOnce(member.promise).mockResolvedValueOnce(body([row("h", "새 주최 결과")]));
    mount(); await screen.findByRole("radio", { name: "전체" }); fireEvent.click(screen.getByRole("radio", { name: "참여" })); submit();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("radio", { name: "주최" })); submit();
    await screen.findByRole("link", { name: /새 주최 결과/ });
    await act(async () => member.resolve(body([row("m", "지연된 이전 결과", "MEMBER")])));
    expect(screen.getByRole("link", { name: /새 주최 결과/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /지연된 이전 결과/ })).not.toBeInTheDocument();
  });
  it("keeps an old HOST-only server honest and does not expose unsupported full-history filters", async () => {
    const host = row("a", "구 서버 주최 기록"); delete host.role;
    vi.spyOn(api, "getAccountRooms").mockResolvedValue({ rooms: [host] });
    mount(); await screen.findByRole("heading", { name: "내가 만든 모임" });
    expect(screen.getByText(/본인이 주최한 모임 목록만 지원/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "전체" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "구 서버 주최 기록" })).toBeInTheDocument();
  });
});

describe("account-only hiding", () => {
  it("blocks duplicate clicks, refetches from first page and preserves other direct links", async () => {
    const pending = deferred<void>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "숨길 모임"), row("b", "다른 모임", "MEMBER")])).mockResolvedValue(body([row("b", "다른 모임", "MEMBER")]));
    const hide = vi.spyOn(api, "hideAccountRoom").mockReturnValue(pending.promise);
    mount(); const button = await screen.findByRole("button", { name: "숨길 모임 내 목록에서 삭제" });
    fireEvent.click(button);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" })); fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" })); });
    expect(hide).toHaveBeenCalledTimes(1); expect(hide).toHaveBeenCalledWith("a".repeat(22));
    expect(screen.getByRole("button", { name: "삭제 중…" })).toBeDisabled();
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByRole("link", { name: /숨길 모임/ })).not.toBeInTheDocument());
    expect(await screen.findByRole("link", { name: /다른 모임/ })).toHaveAttribute("href", `/rooms/${"b".repeat(22)}`);
    expect(get).toHaveBeenLastCalledWith({}, undefined, expect.any(AbortSignal));
  });
  it("keeps failed row and permits retry", async () => {
    vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([row("a", "합성 모임")]));
    const hide = vi.spyOn(api, "hideAccountRoom").mockRejectedValue(new ApiError(503, { detail: "합성 일시 오류" }));
    mount(); fireEvent.click(await screen.findByRole("button", { name: /내 목록에서 삭제/ }));
    fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("합성 일시 오류");
    expect(screen.getByRole("link", { name: /합성 모임/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" }));
    await waitFor(() => expect(hide).toHaveBeenCalledTimes(2));
  });
  it("does not reset another mounted view after navigation", async () => {
    const pending = deferred<void>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([row("a", "합성 모임")]));
    vi.spyOn(api, "hideAccountRoom").mockReturnValue(pending.promise);
    const view = mount(); fireEvent.click(await screen.findByRole("button", { name: /내 목록에서 삭제/ }));
    fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" }));
    view.unmount(); await act(async () => pending.resolve()); expect(get).toHaveBeenCalledTimes(1);
  });
});

  it("ignores a late hide completion after account epoch changes", async () => {
    let epoch = 1; vi.spyOn(session, "getSessionVersion").mockImplementation(() => epoch);
    const pending = deferred<void>();
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([row("a", "계정 경계 모임")]));
    vi.spyOn(api, "hideAccountRoom").mockReturnValue(pending.promise);
    mount(); fireEvent.click(await screen.findByRole("button", { name: /내 목록에서 삭제/ }));
    fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" }));
    epoch++; await act(async () => pending.resolve());
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("resets cached filters and opaque pages after a successful hide", async () => {
    const get = vi.spyOn(api, "getAccountRooms").mockResolvedValueOnce(body([row("a", "첫 페이지")], "opaque-cursor")).mockResolvedValueOnce(body([row("b", "둘째 페이지")])).mockResolvedValue(body([row("b", "둘째 페이지")]));
    vi.spyOn(api, "hideAccountRoom").mockResolvedValue(undefined);
    mount(); await screen.findByRole("link", { name: /첫 페이지/ });
    const client = clients.at(-1)!;
    client.setQueryData(["account-rooms", { role: "HOST" }], { pages: [body([row("a", "숨길 캐시")])], pageParams: [undefined] });
    fireEvent.click(screen.getByRole("button", { name: "더 보기" })); await screen.findByRole("link", { name: /둘째 페이지/ });
    fireEvent.click(screen.getByRole("button", { name: "첫 페이지 내 목록에서 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "내 목록에서 삭제" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(get).toHaveBeenLastCalledWith({}, undefined, expect.any(AbortSignal));
    expect(client.getQueryData(["account-rooms", { role: "HOST" }])).toBeUndefined();
  });

  it("requires confirmation and restores focus after cancellation", async () => {
    vi.spyOn(api, "getAccountRooms").mockResolvedValue(body([row("a", "주말 독서 모임")]));
    const hide = vi.spyOn(api, "hideAccountRoom").mockResolvedValue(undefined);
    mount(); const trigger = await screen.findByRole("button", {name:"주말 독서 모임 내 목록에서 삭제"});
    fireEvent.click(trigger);expect(hide).not.toHaveBeenCalled();
    const cancel = screen.getByRole("button", {name:"취소"});expect(cancel).toHaveFocus();
    fireEvent.click(cancel);expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(trigger).toHaveFocus();expect(hide).not.toHaveBeenCalled();
  });

  it("does not confirm an old account's selected row", async () => {
    let epoch=1;vi.spyOn(session,"getSessionVersion").mockImplementation(()=>epoch);
    vi.spyOn(api,"getAccountRooms").mockResolvedValue(body([row("a","주말 독서 모임")]));const hide=vi.spyOn(api,"hideAccountRoom").mockResolvedValue(undefined);
    mount();fireEvent.click(await screen.findByRole("button",{name:"주말 독서 모임 내 목록에서 삭제"}));epoch++;
    fireEvent.click(screen.getByRole("button",{name:"내 목록에서 삭제"}));expect(hide).not.toHaveBeenCalled();expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
