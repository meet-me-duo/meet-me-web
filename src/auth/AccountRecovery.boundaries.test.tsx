import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
let roomACalls: number;
let mutationCalls: string[];
let writeReply: ReplyFactory;
let fetchMock: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];

beforeEach(async () => {
  vi.stubGlobal("CSS", { supports: () => false }); // jsdom lacks this unrelated landing-animation browser API.
  refreshQueue = []; writeReply = () => json({ code: "UNEXPECTED_MUTATION" }, 500); legacyA = () => json({ code: "SUBMISSION_NOT_FOUND" }, 404); privateA = () => json(snapshot()); publicA = () => json(roomA); roomACalls = 0; mutationCalls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "https://isolated.invalid"); const method = init.method ?? "GET";
    if (url.pathname === "/api/auth/refresh") return (refreshQueue.shift() ?? (() => json({ code: "AUTH_REFRESH_INVALID" }, 401)))();
    if (["/api/auth/logout", "/api/auth/logout-all"].includes(url.pathname)) return new Response(null, { status: 204 });
    const bearer = new Headers(init.headers).get("Authorization");
    if (url.pathname === `/api/rooms/${code}` && method === "GET") { if (bearer === "Bearer synthetic-access-A") { roomACalls++; return publicA(); } return json(bearer === "Bearer synthetic-access-B" ? roomB : publicRoom); }
    if (url.pathname === `/api/rooms/${code}/submission/checks/current`) { return bearer === "Bearer synthetic-access-A" ? privateA() : json(snapshot()); }
    if (url.pathname === `/api/rooms/${code}/submission` && method === "GET") { return legacyA(); }
    if (url.pathname.endsWith("/guest-records") && method === "GET") return json({ records: [] });
    if (method !== "GET") { mutationCalls.push(`${method} ${url.pathname}`); return writeReply(); }
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
const noCompletion = () => expect(screen.queryByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).not.toBeInTheDocument();
const binding = (kind: "PRECHECK" | "LEGACY", revision: number) => ({ verifiedAccountId: A.id, room: code, viewerContext: JSON.stringify([true, "HOST", A.displayName, contextA]), candidateRevision: revision, editorKind: kind });

describe("issue132 exact pending drafts and irreversible fresh ownership denial", () => {
  it.each(["PRECHECK", "LEGACY"] as const)("keeps a newer exact whitespace-only %s edit across a successful pending save, without another POST or PUT", async kind => {
    if (kind === "LEGACY") publicA = () => json({ ...roomA, submission_protocol: "LEGACY" });
    const editor = await verified(); const submitted = "수요일 오후 온라인 합성 조건"; const newer = `  ${submitted}\n `;
    fireEvent.change(editor, { target: { value: submitted } });
    const pending = deferred<Response>(); writeReply = () => pending.promise;
    fireEvent.click(screen.getByRole("button", { name: "조건 제출하기" }));
    await waitFor(() => expect(mutationCalls).toHaveLength(1));
    fireEvent.change(editor, { target: { value: newer } });
    expect(quarantine.hasQuarantinedDraft()).toBe(true);
    const result = kind === "PRECHECK" ? snapshot(1, submitted) : { raw_text: submitted, revision: 1, editable: true, locale: "ko-KR", created_at: "2026-10-18T10:00:00Z" };
    if (kind === "PRECHECK") privateA = () => json(result); else legacyA = () => json(result);
    await act(async () => { pending.resolve(json(result, kind === "PRECHECK" ? 202 : 200)); });
    expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue(newer);
    expect(quarantine.hasQuarantinedDraft()).toBe(true);
    expect(quarantine.recoverQuarantinedDraft(binding(kind, 0))?.rawText).toBe(newer);
    noCompletion(); expect(mutationCalls).toEqual([`${kind === "PRECHECK" ? "POST" : "PUT"} /api/rooms/${code}/submission${kind === "PRECHECK" ? "/checks" : ""}`]);
  });

  it.each(["unjoined", "context-changed"] as const)("clears the retained raw after a verified same-account fresh public ownership result %s, not merely the DOM", async boundary => {
    await dirty(); expect(quarantine.hasQuarantinedDraft()).toBe(true);
    const before = roomACalls;
    publicA = () => json(boundary === "unjoined" ? publicRoom : { ...roomA, viewer: { ...roomA.viewer, context_id: contextB } });
    await act(async () => { await clients[0]!.invalidateQueries({ queryKey: ["room", code] }); });
    await waitFor(() => expect(roomACalls).toBeGreaterThan(before));
    if (boundary === "unjoined") await screen.findByRole("heading", { name: publicRoom.purpose });
    else expect(await screen.findByRole("textbox", { name: /시간·장소 조건/ })).toHaveValue("");
    expect(screen.queryByDisplayValue(raw)).not.toBeInTheDocument();
    expect(quarantine.hasQuarantinedDraft()).toBe(false);
    expect(quarantine.recoverQuarantinedDraft(binding("PRECHECK", 0))).toBeNull();
    expect(mutationCalls).toEqual([]);
  });
});
