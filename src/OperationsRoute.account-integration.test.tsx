import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import * as session from "./auth/session";
import type { AuthSession } from "./auth/session";
import { OperationsError, operationsMessage } from "./api/operations";

// The real App, account boundary, memory store, hook, operations client, and page
// participate. Only HTTP and the wall clock are synthetic.
const now = Date.parse("2026-10-17T12:00:00Z");
const roomId = "11000000-0000-4000-8000-000000000001";
const room = {
  id: roomId, created_at: "2026-10-01T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null,
};
const first: AuthSession = { accessToken: "synthetic-110-memory-A", expiresAt: new Date(now + 900_000).toISOString(),
  account: { id: "11111111-1111-4111-8111-111111111111", displayName: "Test A" } };
const clients: QueryClient[] = [];
let restored: AuthSession | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let operationReply: (url: string, init?: RequestInit) => Promise<Response>;
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function operationCalls() { return fetcher.mock.calls.filter(([url]) => String(url).includes("/api/operations/")); }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/operations?operator_id=HOST"]}><App /></MemoryRouter></QueryClientProvider>);
}
function reloadRooms(container: HTMLElement) { fireEvent.click(container.querySelector(".operations-nav button")!); }

beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  restored = first;
  operationReply = async () => json({ items: [room], next_cursor: null });
  fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/auth/refresh")) return restored ? json(restored) : json({}, 401);
    if (url.endsWith("/api/auth/logout")) return json({});
    if (url.includes("/api/operations/")) return operationReply(url, init);
    throw new Error("unexpected-test-http");
  });
  vi.stubGlobal("fetch", fetcher);
  await session.endSession();
  fetcher.mockClear();
});
afterEach(async () => {
  cleanup(); for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})));
  await session.endSession();
  vi.unstubAllGlobals();
});

describe("#110 route binding to the actual #109 memory session", () => {
  it("uses the current memory token on each request, including a same-account refresh", async () => {
    await session.restoreSession();
    const revision = session.getSessionVersion();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { container } = mount();
    await screen.findByRole("button", { name: new RegExp(roomId) });
    expect(new Headers(operationCalls()[0]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${first.accessToken}`);
    restored = { ...first, accessToken: "synthetic-110-memory-B" };
    await act(async () => { await session.restoreSession(); });
    expect(session.getSessionVersion()).toBe(revision);
    reloadRooms(container);
    await waitFor(() => expect(operationCalls()).toHaveLength(2));
    expect(new Headers(operationCalls()[1]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${restored.accessToken}`);
    for (const [url, init] of operationCalls()) {
      expect(String(url)).not.toContain("synthetic-110");
      expect(String(url)).not.toContain("operator_id");
      expect(new Headers(init?.headers).has("X-Operator-Id")).toBe(false);
      expect(init?.cache).toBe("no-store");
    }
    expect(storage).not.toHaveBeenCalled();
  });

  it("shows authentication required for a known expired account before the next operations fetch", async () => {
    await session.restoreSession();
    const { container } = mount();
    await screen.findByRole("button", { name: new RegExp(roomId) });
    fetcher.mockClear();
    vi.mocked(Date.now).mockReturnValue(Date.parse(first.expiresAt));
    // The existing boundary timer remains in the future. The next user request
    // must assess expiration without dropping to guest cookies.
    reloadRooms(container);
    await screen.findByText(operationsMessage(new OperationsError(401)), { exact: true });
    expect(operationCalls()).toHaveLength(0);
    expect(session.getSession()?.account.id).toBe(first.account.id);
  });

  it("fails closed with sanitized 503 for an unexpected memory token supplier failure", async () => {
    await session.restoreSession();
    vi.spyOn(session, "getAccessToken").mockImplementation(() => { throw new Error("PRIVATE_MEMORY_SUPPLIER_FAILURE"); });
    const { container } = mount();
    await screen.findByText(operationsMessage(new OperationsError(503)), { exact: true });
    expect(operationCalls()).toHaveLength(0);
    expect(container).not.toHaveTextContent("PRIVATE_MEMORY_SUPPLIER_FAILURE");
  });

  it("allows missing account only as a headerless server-authorized request and does not forge HOST identity", async () => {
    restored = null;
    operationReply = async () => json({ detail: "PRIVATE_UPSTREAM" }, 401);
    const { container } = mount();
    await screen.findByText(operationsMessage(new OperationsError(401)), { exact: true });
    expect(operationCalls()).toHaveLength(1);
    const [url, init] = operationCalls()[0]!;
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(new Headers(init?.headers).has("X-User-Id")).toBe(false);
    expect(String(url)).not.toContain("HOST");
    expect(container).not.toHaveTextContent("PRIVATE_UPSTREAM");
  });

  it.each(["account switch", "logout"] as const)("erases old summary and aborts its late response after actual %s", async action => {
    await session.restoreSession();
    const { container } = mount();
    await screen.findByRole("button", { name: new RegExp(roomId) });
    let complete!: (response: Response) => void;
    operationReply = () => new Promise(resolve => { complete = resolve; });
    reloadRooms(container);
    await waitFor(() => expect(operationCalls()).toHaveLength(2));
    const oldSignal = operationCalls()[1]?.[1]?.signal;
    operationReply = async () => json({ items: [], next_cursor: null });
    const previousRevision = session.getSessionVersion();
    await act(async () => {
      if (action === "logout") await session.endSession();
      else { restored = { ...first, accessToken: "synthetic-110-memory-C", account: { id: "22222222-2222-4222-8222-222222222222", displayName: "Test B" } }; await session.restoreSession(); }
    });
    expect(session.getSessionVersion()).toBeGreaterThan(previousRevision);
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(operationCalls()).toHaveLength(3));
    await act(async () => { complete(json({ items: [room], next_cursor: null })); });
    expect(container).not.toHaveTextContent(roomId);
    const expected = action === "logout" ? null : "Bearer synthetic-110-memory-C";
    expect(new Headers(operationCalls()[2]?.[1]?.headers).get("Authorization")).toBe(expected);
  });
});
