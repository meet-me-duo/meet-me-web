import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { AccountControls } from "./AccountControls";
import { AccountActionsProvider } from "./AccountActionsProvider";
import AccountSecurityPage from "./AccountSecurityPage";
import { endSession, getSession, restoreSession } from "./session";

const account = { id: "11111111-2222-4333-8444-555555555555", displayName: "합성 회원" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const auth = (next = account) => json({ accessToken: "synthetic-access", expiresAt: new Date(Date.now() + 900_000).toISOString(), account: next });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let fetchMock: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];

beforeEach(async () => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await endSession(); fetchMock.mockClear();
});
afterEach(async () => { cleanup(); clients.splice(0).forEach(client => client.clear()); fetchMock.mockResolvedValue(new Response(null, { status: 204 })); await endSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() { return render(<MemoryRouter><AccountActionsProvider><AccountControls /><Routes><Route path="/account/security" element={<AccountSecurityPage />} /><Route path="*" element={null} /></Routes></AccountActionsProvider></MemoryRouter>); }
async function signedIn() { fetchMock.mockResolvedValueOnce(auth()); await act(async () => { await restoreSession(); }); fetchMock.mockClear(); }
function openSecurity() {
  fireEvent.click(screen.getByRole("button", { name: /계정 메뉴/ }));
  fireEvent.click(screen.getByRole("link", { name: "계정 보안" }));
  expect(screen.getByRole("heading", { name: "계정 보안" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "모든 기기 로그아웃" }));
  return screen.getByRole("dialog", { name: "모든 기기에서 로그아웃할까요?" });
}

describe("account state and guarded account actions", () => {
  it("shows a login entry for anonymous state, and only an account trigger after authentication", async () => {
    mount(); expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /계정 메뉴/ })).not.toBeInTheDocument();
    await signedIn();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "합성 회원 계정 메뉴" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /모든 기기/ })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계정 보안" })).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger); fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("requires a separate security confirmation and sends nothing on cancel or Escape", async () => {
    await signedIn(); mount();
    const dialog = openSecurity();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("현재 기기를 포함");
    expect(dialog).toHaveTextContent("최대 15분");
    expect(dialog).toHaveTextContent("Google·Kakao 계정 연결은 유지");
    const cancel = within(dialog).getByRole("button", { name: "취소" });
    const confirm = within(dialog).getByRole("button", { name: "모든 기기에서 로그아웃" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true }); expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" }); expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모든 기기 로그아웃" })).toHaveFocus();
    fireEvent.keyDown(openSecurity(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])("uses the unchanged logout contract once (allDevices=%s), then restores the login entry", async all => {
    await signedIn(); mount();
    const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
    let action: HTMLElement;
    if (all) action = within(openSecurity()).getByRole("button", { name: "모든 기기에서 로그아웃" });
    else { fireEvent.click(screen.getByRole("button", { name: /계정 메뉴/ })); action = screen.getByRole("button", { name: "로그아웃" }); }
    act(() => { fireEvent.click(action); fireEvent.click(action); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(`/api/auth/${all ? "logout-all" : "logout"}`, expect.objectContaining({ method: "POST", credentials: "include", headers: { Authorization: "Bearer synthetic-access" } }));
    expect(getSession()).toBeNull();
    expect(screen.queryByRole("button", { name: /계정 메뉴/ })).not.toBeInTheDocument();
    expect(screen.getByText("로그아웃 중…")).toBeInTheDocument();
    await act(async () => pending.resolve(new Response(null, { status: 204 })));
    expect(await screen.findByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports uncertain all-device logout after server failure, without restoring account UI or retrying", async () => {
    await signedIn(); mount(); fetchMock.mockResolvedValueOnce(json({ detail: "private server detail" }, 503));
    fireEvent.click(within(openSecurity()).getByRole("button", { name: "모든 기기에서 로그아웃" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("서버에서 모든 기기의 로그아웃을 확인하지 못했어요");
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /계정 메뉴/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose an anonymous login action during refresh, and can recover from an unavailable response", async () => {
    mount(); const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
    let work!: ReturnType<typeof restoreSession>;
    act(() => { work = restoreSession(); });
    expect(screen.getByRole("status")).toHaveTextContent("로그인 확인 중");
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    await act(async () => { pending.resolve(json({}, 503)); await work; });
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("로그인 확인 필요");
    await signedIn(); expect(screen.getByRole("button", { name: /계정 메뉴/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("keeps a known account disabled during refresh and removes it after expiry", async () => {
    await signedIn(); mount(); const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
    let work!: ReturnType<typeof restoreSession>;
    act(() => { work = restoreSession(); });
    expect(screen.getByRole("button", { name: /계정 메뉴/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    await act(async () => { pending.resolve(json({ code: "AUTH_REFRESH_INVALID" }, 401)); await work; });
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText(account.displayName)).not.toBeInTheDocument();
  });

  it("never displays the previous account's logout error after a new account signs in", async () => {
    await signedIn(); mount(); const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(within(openSecurity()).getByRole("button", { name: "모든 기기에서 로그아웃" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce(auth({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayName: "다른 합성 회원" }));
    const refresh = restoreSession();
    await act(async () => { pending.resolve(json({}, 503)); await refresh; });
    expect(screen.getByRole("button", { name: "다른 합성 회원 계정 메뉴" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("redirects an authenticated /login visit to the account list and offers an icon with a history label", async () => {
    await signedIn(); fetchMock.mockResolvedValue(json({ rooms: [] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "내가 만든 모임" })).toBeInTheDocument();
    const history = screen.getByRole("link", { name: "내 모임" });
    expect(history).toHaveAttribute("href", "/account/rooms"); expect(history.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Google로 로그인" })).not.toBeInTheDocument();
  });
});
