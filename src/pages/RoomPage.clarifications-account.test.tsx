// Independent combined App/session/privacy oracle. Real #109 session + boundary,
// #107 question forms and QueryClient; synthetic transport only, no server/AI.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { endSession, getSessionVersion, restoreSession } from "../auth/session";
import type { Room } from "../api/types";

const code = "abcdefghijklmnopqrstuv";
const questionA = "11111111-1111-4111-8111-111111111111";
const questionB = "22222222-2222-4222-8222-222222222222";
const round = "33333333-3333-4333-8333-333333333333";
const accountIds = { A: "44444444-4444-4444-8444-444444444444", B: "55555555-5555-4555-8555-555555555555" };
const root = `/api/rooms/${code}`;
const clients: QueryClient[] = [];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
async function fixture(options: { guest?: boolean; guestHost?: boolean; unjoinedB?: boolean; marker?: boolean; pending?: boolean; firstFailure?: boolean } = {}) {
  let active: "A" | "B" | null = options.guest || options.guestHost ? null : "A"; let rotated = false;
  const writes: { path: string; token: string | null; body: Record<string, unknown> }[] = []; const reads: { path: string; token: string | null }[] = [];
  const pending = deferred<Response>(); let answers = 0;
  const snapshot = (identity: "A" | "B" | "G"): Room => ({
    invite_code: code, purpose: "합성 계정과 보완 질문 통합", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
    expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
    public_status: "COLLECTING", viewer: identity === "B" && options.unjoinedB ? { joined: false, role: null, display_name: null, context_id: null } : { joined: true, role: options.guestHost ? "HOST" : "MEMBER", display_name: "동일한 표시 이름", context_id: round },
    input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", state_version: 11, revision_generation: 1, revision_round: { id: round, generation: 1, status: "OPEN" },
    capabilities: { can_edit_own_submission: true, can_open_revision: false, can_analyze_revision: false, can_confirm: false, can_force_reparse: false },
    ...(options.marker === false ? {} : { clarification_protocol: "owner-clarification-v1" }),
  });
  const fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, "http://localhost").pathname; const token = new Headers(init.headers).get("Authorization"); const method = init.method ?? "GET";
    if (path === "/api/auth/refresh") return active ? json({ accessToken: `synthetic-${active}${rotated ? "-rotated" : ""}`, expiresAt: new Date(Date.now() + 900_000).toISOString(), account: { id: accountIds[active], displayName: "동일한 표시 이름" } }) : json({ code: "AUTH_REFRESH_INVALID" }, 401);
    if (path === "/api/auth/logout") return json({});
    const identity = token?.includes("synthetic-B") ? "B" : token ? "A" : "G";
    if (method === "GET") {
      reads.push({ path, token });
      if (path === root) return json(snapshot(identity));
      if (path === root + "/submission") return json({ raw_text: `${identity}_only_saved_original`, revision: 7, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" });
      if (path === root + "/submission/clarifications") return json({ questions: [{ question_id: identity === "B" ? questionB : questionA, source_revision: 7, excerpt: `${identity}_only_question_excerpt`, question: `${identity} 본인 질문`, option_a: `${identity} 오전 가능`, option_b: `${identity} 오후 가능`, editable: true }], state_version: 11 });
    } else {
      writes.push({ path, token, body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown> });
      if (path.endsWith("/answer")) {
        answers++;
        if (options.pending && identity === "A") return pending.promise;
        if (options.firstFailure && answers === 1) return json({ detail: "합성 일시 저장 장애" }, 503);
        return json({ status: "ANSWERED", submission: { raw_text: `${identity}_answer`, revision: 8, editable: true, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" } });
      }
    }
    throw new Error(`Unexpected synthetic endpoint ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  await restoreSession();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 }, mutations: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><App /></MemoryRouter></QueryClientProvider>);
  async function switchToB() { active = "B"; await act(async () => { await endSession(); await restoreSession(); }); }
  async function rotateSameAccount() { rotated = true; await act(async () => { await restoreSession(); }); }
  return { client, reads, writes, fetch, pending, switchToB, rotateSameAccount };
}
async function typeDirect(text: string) { fireEvent.click(await screen.findByRole("radio", { name: "직접 입력" })); fireEvent.change(screen.getByRole("textbox"), { target: { value: text } }); }
function save() { fireEvent.click(screen.getByRole("button", { name: "답변 저장" })); }
afterEach(async () => { cleanup(); for (const client of clients.splice(0)) client.clear(); await endSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#107 clarification UI inside #109's real account boundary", () => {
  it("purges A's draft and caches on A→B even when room, name, role and viewer context hint are identical", async () => {
    const mock = await fixture(); const oldDraft = "A만의 비공개 미저장 직접 답변"; await typeDirect(oldDraft);
    await mock.switchToB(); await screen.findByText("B 본인 질문");
    expect(screen.queryByDisplayValue(oldDraft)).not.toBeInTheDocument(); expect(screen.queryByText("A_only_question_excerpt")).not.toBeInTheDocument();
    expect(mock.client.getQueryCache().getAll().some(query => String(JSON.stringify(query.state.data)).includes("A_only_"))).toBe(false);
    expect(screen.getByRole("button", { name: "답변 저장" })).toBeDisabled(); expect(mock.writes).toEqual([]);
  });

  it.each([200, 403])("does not let A's pending answer HTTP %i contaminate B's new private draft or authorization", async status => {
    const mock = await fixture({ pending: true }); fireEvent.click(await screen.findByRole("radio", { name: "A 오전 가능" })); save();
    await waitFor(() => expect(mock.writes).toHaveLength(1)); await mock.switchToB(); await screen.findByText("B 본인 질문");
    const draft = "B 본인의 새 질문에 대한 임시 직접 답변"; await typeDirect(draft);
    await act(async () => { mock.pending.resolve(json(status === 200 ? { status: "ANSWERED", submission: { raw_text: "A_late_private_result", revision: 8 } } : { detail: "A_late_private_denial" }, status)); });
    expect(screen.getByRole("textbox")).toHaveValue(draft); expect(screen.getByText("B 본인 질문")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "모임을 불러오지 못했어요" })).not.toBeInTheDocument(); expect(screen.queryByText(/A_late_private|답변을 새 입력으로 저장/)).not.toBeInTheDocument();
    expect(mock.writes).toHaveLength(1); expect(mock.client.getQueryCache().getAll().some(query => String(JSON.stringify(query.state.data)).includes("A_late_private"))).toBe(false);
  });

  it("preserves the draft and failed operation UUID through same-account rotation while sending the new Bearer on explicit retry", async () => {
    const mock = await fixture({ firstFailure: true }); const text = "내일 오후 7~8시, 비대면으로 가능해요"; await typeDirect(text); save(); await screen.findByRole("alert");
    const epoch = getSessionVersion(); const first = mock.writes[0]!; await mock.rotateSameAccount();
    expect(getSessionVersion()).toBe(epoch); expect(screen.getByRole("textbox")).toHaveValue(text); expect(mock.writes).toHaveLength(1);
    save(); await waitFor(() => expect(mock.writes).toHaveLength(2));
    expect(mock.writes[1]?.body).toEqual(first.body); expect(mock.writes[1]?.token).toBe("Bearer synthetic-A-rotated");
    expect(mock.writes.every(write => write.path.endsWith("/answer"))).toBe(true);
  });

  it("keeps guest MEMBER participation until explicit login and never auto-claims its question for an unjoined account", async () => {
    const mock = await fixture({ guest: true, unjoinedB: true }); await screen.findByText("G 본인 질문"); await mock.switchToB();
    await screen.findByRole("button", { name: "이 브라우저의 기존 참여 연결" });
    expect(screen.queryByText("G_only_question_excerpt")).not.toBeInTheDocument(); expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(mock.reads.some(read => read.path.endsWith("/clarifications") && read.token === "Bearer synthetic-B")).toBe(false);
    expect(mock.writes).toEqual([]);
  });

  it("keeps a legacy guest HOST behind login before requesting a private clarification", async () => {
    const mock = await fixture({ guestHost: true }); await screen.findByRole("heading", { name: "로그인하고 모임을 만들어 보세요" });
    expect(mock.reads.some(read => read.path.endsWith("/clarifications"))).toBe(false); expect(screen.queryByRole("radio")).not.toBeInTheDocument(); expect(mock.writes).toEqual([]);
  });

  it("makes no clarification GET for an authenticated room without the supported protocol marker", async () => {
    const mock = await fixture({ marker: false }); await screen.findByText("합성 계정과 보완 질문 통합");
    expect(mock.reads.some(read => read.path.endsWith("/clarifications"))).toBe(false); expect(mock.writes).toEqual([]);
  });
});
