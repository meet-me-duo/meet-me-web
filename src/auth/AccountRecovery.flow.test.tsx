import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as session from "./session";
import * as quarantine from "./draftQuarantine";
import type { Room } from "../api/types";
import type { SubmissionCheckSnapshot } from "../api/precheck";

// Independent A acceptance using actual App/session/API code and isolated
// synthetic HTTP responses. No real OAuth, model, browser or database claim.
const code = "abcdefghijklmnopqrstuv";
const path = `/rooms/${code}`;
const A = { id: "11111111-2222-4333-8444-555555555555", displayName: "합성 회원 A" };
const B = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayName: "합성 회원 B" };
const contextA = "22222222-2222-4222-8222-222222222222";
const contextB = "33333333-3333-4333-8333-333333333333";
const raw = "  수요일 오후의 미저장 합성 초안\n온라인만  ";
const savedRaw = "서버가 저장한 목요일 오후 합성 원문";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const auth = (account = A) => json({ accessToken: account.id === A.id ? "synthetic-access-A" : "synthetic-access-B", expiresAt: new Date(Date.now() + 900_000).toISOString(), account });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const publicRoom: Room = {
  invite_code: code, purpose: "합성 복구 모임", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null,
  public_status: "COLLECTING", state_version: 1, viewer: { joined: false, display_name: null, role: null, context_id: null },
  input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1",
};
const roomA: Room = { ...publicRoom, viewer: { joined: true, display_name: A.displayName, role: "HOST", context_id: contextA } };
const roomB: Room = { ...publicRoom, viewer: { joined: true, display_name: B.displayName, role: "MEMBER", context_id: contextB } };
function snapshot(revision = 0, text = savedRaw, accepted = false): SubmissionCheckSnapshot {
  const value = { revision, raw_text: text, created_at: "2026-10-18T10:00:00Z", interpretation_reference_at: "2026-10-18T10:00:00Z" };
  return { candidate: revision ? value : null, accepted: accepted ? { ...value, confirmation_source: "PRECHECK" } : null,
    check: revision ? { id: "44444444-4444-4444-8444-444444444444", status: accepted ? "CLEAR" : "QUEUED", version: 1, retry_allowed: false, failure_code: null, question: null } : null,
    submission_complete: accepted, applied_to_result: false, operation_outcome: null,
    room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null } };
}
type ReplyFactory = () => Response | Promise<Response>;
let refreshQueue: ReplyFactory[];
let privateA: ReplyFactory;
let publicA: ReplyFactory;
let legacyA: ReplyFactory;
let privateCalls: number;
let roomACalls: number;
let mutationCalls: string[];
let fetchMock: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];

beforeEach(async () => {
  vi.stubGlobal("CSS", { supports: () => false }); // jsdom lacks this unrelated landing-animation browser API.
  refreshQueue = []; legacyA = () => json({ code: "SUBMISSION_NOT_FOUND" }, 404); privateA = () => json(snapshot()); publicA = () => json(roomA); privateCalls = 0; roomACalls = 0; mutationCalls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "https://isolated.invalid"); const method = init.method ?? "GET";
    if (url.pathname === "/api/auth/refresh") return (refreshQueue.shift() ?? (() => json({ code: "AUTH_REFRESH_INVALID" }, 401)))();
    if (["/api/auth/logout", "/api/auth/logout-all"].includes(url.pathname)) return new Response(null, { status: 204 });
    const bearer = new Headers(init.headers).get("Authorization");
    if (url.pathname === `/api/rooms/${code}` && method === "GET") { if (bearer === "Bearer synthetic-access-A") { roomACalls++; return publicA(); } return json(bearer === "Bearer synthetic-access-B" ? roomB : publicRoom); }
    if (url.pathname === `/api/rooms/${code}/submission/checks/current`) { privateCalls++; return bearer === "Bearer synthetic-access-A" ? privateA() : json(snapshot()); }
    if (url.pathname === `/api/rooms/${code}/submission` && method === "GET") { privateCalls++; return legacyA(); }
    if (url.pathname.endsWith("/guest-records") && method === "GET") return json({ records: [] });
    if (method !== "GET") { mutationCalls.push(`${method} ${url.pathname}`); return json({ code: "UNEXPECTED_MUTATION" }, 500); }
    throw new Error("Unexpected isolated test endpoint");
  });
  vi.stubGlobal("fetch", fetchMock);
  await session.endSession(); quarantine.clearQuarantinedDraft(); localStorage.clear(); sessionStorage.clear();
});
afterEach(async () => { cleanup(); for (const client of clients.splice(0)) client.clear(); await session.endSession(); quarantine.clearQuarantinedDraft(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });
function mount(initialPath = path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialPath]}><App /></MemoryRouter></QueryClientProvider>);
}
async function restore(factory: ReplyFactory) { refreshQueue.push(factory); await act(async () => { await session.restoreSession(); }); }
async function verified(initial = snapshot()) { privateA = () => json(initial); await restore(() => auth()); mount(); return screen.findByRole("textbox", { name: /시간·장소 조건/ }); }
async function dirty() { const input = await verified(); fireEvent.change(input, { target: { value: raw } }); return input; }
const noPrivateRaw = () => { expect(screen.queryByDisplayValue(raw)).not.toBeInTheDocument(); expect(document.body.textContent).not.toContain(raw); };
const noCompletion = () => expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
const beforeUnload = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
function preventNativeNavigation() { document.addEventListener("click", event => event.preventDefault(), { once: true }); }
function privateStorageAbsent() { const dump = JSON.stringify({ ...localStorage, ...sessionStorage }); for (const value of [raw, savedRaw, A.id, contextA, "synthetic-access-A"]) expect(dump).not.toContain(value); }

describe("issue132 neutral recovery and honest restoration failure UI", () => {
  it("offers neutral room recovery for first401, without claiming expiry or exposing account identity", async () => {
    mount(); const note = await screen.findByRole("region", { name: "계정 복구" });
    expect(note).toHaveTextContent(/계정으로 참여/); expect(note).toHaveTextContent(/같은 계정/); expect(note).toHaveTextContent(/서버에 저장/);
    expect(within(note).queryByRole("alert")).not.toBeInTheDocument(); expect(note).not.toHaveTextContent(/세션.*만료|로그인.*만료/);
    expect(note).not.toHaveTextContent(A.displayName); expect(mutationCalls).toEqual([]); privateStorageAbsent();
  });

  it("does not present ordinary first401 on home as an expired account error", async () => {
    mount("/"); await screen.findByRole("button", { name: /모임 만들기/ });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(document.body).not.toHaveTextContent(/로그인.*만료|세션.*만료/);
  });

  it("opens only the current public room in a separate noopener tab and keeps provider returnTo path-only", async () => {
    mount(); const note = await screen.findByRole("region", { name: "계정 복구" });
    const tab = within(note).getByRole("link", { name: "새 탭에서 로그인" });
    expect(tab).toHaveAttribute("href", path); expect(tab).toHaveAttribute("target", "_blank");
    expect(tab.getAttribute("rel")?.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    for (const provider of ["Google", "Kakao"]) {
      const link = within(note).getByRole("link", { name: new RegExp(provider) });
      expect(link).toHaveAttribute("href", expect.stringMatching(new RegExp(`/api/auth/${provider.toLowerCase()}/start$`)));
      expect(link).not.toHaveAttribute("target", "_blank"); preventNativeNavigation(); fireEvent.click(link);
      expect(sessionStorage.getItem("meetme.login-return")).toBe(path);
      // A return from OAuth must release the document-wide navigation lock.
      act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    }
    privateStorageAbsent(); expect(mutationCalls).toEqual([]);
  });

  it.each([503, "network", "malformed"] as const)("shows bounded unavailable recovery for %s without raw provider details or false completion", async failure => {
    refreshQueue.push(() => failure === "network" ? Promise.reject(new TypeError("synthetic-private-provider-detail")) : failure === "malformed" ? json({ detail: "synthetic-private-provider-detail" }) : json({ detail: "synthetic-private-provider-detail" }, failure));
    mount(); const note = await screen.findByRole("region", { name: "계정 복구" });
    expect(note).toHaveTextContent(/확인하지 못|확인할 수 없/); expect(note).not.toHaveTextContent("synthetic-private-provider-detail");
    noCompletion(); expect(mutationCalls).toEqual([]); privateStorageAbsent();
  });

  it("does not rotate on ordinary guest focus; explicit recovery intent coalesces focus and manual checks", async () => {
    mount(); const note = await screen.findByRole("region", { name: "계정 복구" }); const initial = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/refresh")).length;
    fireEvent(window, new Event("focus")); await act(async () => { await Promise.resolve(); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/refresh"))).toHaveLength(initial);
    const tab = within(note).getByRole("link", { name: "새 탭에서 로그인" }); preventNativeNavigation(); fireEvent.click(tab);
    const pending = deferred<Response>(); refreshQueue.push(() => pending.promise);
    fireEvent(window, new Event("focus")); fireEvent.click(within(note).getByRole("button", { name: "로그인 상태 다시 확인" })); fireEvent(window, new Event("focus"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/refresh"))).toHaveLength(initial + 1));
    await act(async () => { pending.resolve(auth()); }); await screen.findByRole("button", { name: "입력 마감하기" });
    expect(screen.queryByRole("region", { name: "계정 복구" })).not.toBeInTheDocument(); expect(mutationCalls).toEqual([]);
  });
});

describe("issue132 original-tab private draft quarantine across authentication remounts", () => {
  it("hides an expired account draft and restores it only after same-account fresh room ownership AND private snapshot complete", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); noPrivateRaw();
    const note = await screen.findByRole("region", { name: "계정 복구" }); expect(note).toHaveTextContent(/다시.*로그인|로그인.*다시|로그인.*확인/);
    const room = deferred<Response>(); const own = deferred<Response>(); const roomBefore = roomACalls; const ownBefore = privateCalls;
    publicA = () => room.promise; privateA = () => own.promise;
    await restore(() => auth()); await waitFor(() => expect(roomACalls).toBeGreaterThan(roomBefore)); noPrivateRaw();
    await act(async () => { room.resolve(json(roomA)); }); await waitFor(() => expect(privateCalls).toBeGreaterThan(ownBefore)); noPrivateRaw();
    await act(async () => { own.resolve(json(snapshot())); });
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(raw);
    expect(document.body).toHaveTextContent(/아직 저장|미저장/); noCompletion(); expect(mutationCalls).toEqual([]); privateStorageAbsent();
  });

  it("preserves a changed server revision and offers the quarantined raw separately until explicit use", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); privateA = () => json(snapshot(2)); await restore(() => auth());
    const conflict = await screen.findByRole("region", { name: "보관한 임시 입력" });
    expect(within(conflict).getByRole("textbox")).toHaveValue(raw); expect(within(conflict).getByRole("textbox")).toHaveAttribute("readonly");
    expect(document.body).toHaveTextContent(savedRaw); expect(mutationCalls).toEqual([]);
    fireEvent.click(within(conflict).getByRole("button", { name: "임시 입력 사용" }));
    expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(raw); noCompletion(); expect(mutationCalls).toEqual([]);
  });

  it("does not recover A raw for another fresh participant context even when the account is A", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); publicA = () => json({ ...roomA, viewer: { ...roomA.viewer, context_id: contextB } }); await restore(() => auth());
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); noPrivateRaw(); expect(mutationCalls).toEqual([]);
  });

  it("irreversibly drops A's draft on B login; later A verification cannot revive it", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); await restore(() => auth(B));
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); noPrivateRaw();
    await restore(() => auth()); expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); noPrivateRaw(); privateStorageAbsent();
  });

  it("clears quarantine on explicit logout and refuses later same-account resurrection", async () => {
    await dirty(); fireEvent.click(screen.getByRole("button", { name: /계정 메뉴/ })); fireEvent.click(screen.getByRole("button", { name: "로그아웃" })); await screen.findByRole("region", { name: "계정 복구" }); noPrivateRaw();
    await restore(() => auth()); expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); noPrivateRaw();
  });

  it("discards quarantined raw after a fresh private ownership denial rather than keeping a recoverable copy", async () => {
    await dirty(); expect(quarantine.hasQuarantinedDraft()).toBe(true); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); privateA = () => json({ code: "GUEST_PROOF_INSUFFICIENT" }, 403); await restore(() => auth());
    await screen.findByText("모임을 불러오지 못했어요"); noPrivateRaw();
    expect(quarantine.hasQuarantinedDraft()).toBe(false);
  });

  it("warns before full unload while a private draft is retained, including anonymous remount, and clears warning on logout", async () => {
    const input = await verified(); expect(beforeUnload()).toBe(false); fireEvent.change(input, { target: { value: raw } }); expect(beforeUnload()).toBe(true);
    await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); noPrivateRaw(); expect(beforeUnload()).toBe(true);
    await act(async () => { await session.endSession(); }); expect(beforeUnload()).toBe(false);
  });

  it("warns for an active501-character draft without truncating it or expanding the500-character quarantine", async () => {
    const input = await verified(); const oversized = "😀".repeat(501); fireEvent.change(input, { target: { value: oversized } });
    expect(input).toHaveValue(oversized); expect(beforeUnload()).toBe(true);
    await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); await restore(() => auth());
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); expect(mutationCalls).toEqual([]);
  });


  it("restores a LEGACY draft only after its own fresh submission revision, without PUT or precheck clock confusion", async () => {
    publicA = () => json({ ...roomA, submission_protocol: "LEGACY" });
    legacyA = () => json({ raw_text: savedRaw, revision: 4, editable: true, locale: "ko-KR", created_at: "2026-10-18T10:00:00Z" });
    await restore(() => auth()); mount(); await screen.findByText(savedRaw);
    fireEvent.click(screen.getByRole("button", { name: "내 조건 수정" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: raw } });
    await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); noPrivateRaw();
    const own = deferred<Response>(); legacyA = () => own.promise; const before = privateCalls;
    await restore(() => auth()); await waitFor(() => expect(privateCalls).toBeGreaterThan(before)); noPrivateRaw();
    await act(async () => { own.resolve(json({ raw_text: savedRaw, revision: 4, editable: true, locale: "ko-KR", created_at: "2026-10-18T10:00:00Z" })); });
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(raw);
    noCompletion(); expect(mutationCalls).toEqual([]); privateStorageAbsent();
  });

  it("does not apply a PRECHECK quarantine to a newly served LEGACY editor even with equal numeric revisions", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401));
    publicA = () => json({ ...roomA, submission_protocol: "LEGACY" }); await restore(() => auth());
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(""); noPrivateRaw(); expect(mutationCalls).toEqual([]);
  });

  it("does not let delayed A private JSON revive A raw or erase B's newer draft across another recovery", async () => {
    await dirty(); await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401));
    const oldJson = deferred<unknown>(); const entered = deferred<void>();
    privateA = () => ({ ok: true, status: 200, json: () => { entered.resolve(); return oldJson.promise; } } as Response);
    await restore(() => auth()); await entered.promise;
    await restore(() => auth(B)); const draftB = "B가 작성한 별도의 합성 미저장 조건";
    fireEvent.change(await screen.findByRole("textbox", { name: /시간·장소 조건/ }), { target: { value: draftB } });
    await act(async () => { oldJson.resolve(snapshot()); });
    expect(screen.getByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(draftB); noPrivateRaw();
    await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); await restore(() => auth(B));
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(draftB); noPrivateRaw(); expect(mutationCalls).toEqual([]);
  });
  it.each([false, true])("recovers server-saved202 candidate/accepted=%s only from a fresh owner GET, with no automatic resubmission", async accepted => {
    privateA = () => json(snapshot(1, savedRaw, accepted)); await restore(() => auth()); mount(); await screen.findByText(savedRaw);
    await restore(() => json({ code: "AUTH_REFRESH_INVALID" }, 401)); expect(screen.queryByText(savedRaw)).not.toBeInTheDocument();
    const own = deferred<Response>(); privateA = () => own.promise; const before = privateCalls; await restore(() => auth()); await waitFor(() => expect(privateCalls).toBeGreaterThan(before));
    expect(screen.queryByText(savedRaw)).not.toBeInTheDocument(); await act(async () => { own.resolve(json(snapshot(1, savedRaw, accepted))); }); await screen.findByText(savedRaw);
    if (accepted) expect(screen.getByText("제출 완료 · 다른 참여자를 기다려 주세요.")).toBeInTheDocument(); else noCompletion();
    expect(mutationCalls).toEqual([]); privateStorageAbsent();
  });
});
