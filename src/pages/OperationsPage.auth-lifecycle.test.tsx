import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OperationsPage from "./OperationsPage";
import type { OperationsApi, OperationRoom, OperationRooms, OperationInvocationDetail } from "../api/operations";

const roomId = "11000000-0000-4000-8000-000000000001";
const nextRoomId = "11000000-0000-4000-8000-000000000002";
const invocationId = "22000000-0000-4000-8000-000000000001";
const room: OperationRoom = { id: roomId, created_at: "2026-10-01T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null, submission_deadline: null,
  manual_only: true, collection_status: "COLLECTING", closure_reason: null, closed_at: null,
  participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null };
const invocation = { id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
  started_at: "2026-10-01T01:02:00Z", deadline_at: "2026-10-01T01:03:00Z", finished_at: null,
  winner_attempt_id: null, gemini_admitted_attempts: 1, luna_admitted_attempts: 0, execution_ordinal: 2,
  revision_linked: true, recorded_elapsed_millis: null, parser_dispatch_count: null, http_request_count: null };
function apiFixture(overrides: Partial<OperationsApi> = {}): OperationsApi {
  return { rooms: vi.fn().mockResolvedValue({ items: [room], next_cursor: null }),
    room: vi.fn().mockResolvedValue({ room, invocations: [invocation], next_cursor: null, revision_counts: { open: 0, queued: 0, reused: 0 }, legacy_attempt_count: 0 }),
    invocation: vi.fn().mockResolvedValue({ room_id: roomId, invocation, attempts: [], usage_by_provider: [] }), ...overrides };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("auth-context revision boundary without a duplicated auth store", () => {
  it("clears an already displayed snapshot and reloads for a changed revision with the same API object", async () => {
    let complete!: (value: OperationRooms) => void;
    const rooms = vi.fn().mockResolvedValueOnce({ items: [room], next_cursor: null }).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const api = apiFixture({ rooms });
    const { rerender, container } = render(<OperationsPage api={api} authRevision={0} />);
    await screen.findByRole("button", { name: `방 ${roomId}` });
    rerender(<OperationsPage api={api} authRevision={1} />);
    expect(container).not.toHaveTextContent(roomId);
    await waitFor(() => expect(rooms).toHaveBeenCalledTimes(2));
    await act(async () => complete({ items: [{ ...room, id: nextRoomId }], next_cursor: null }));
    await screen.findByRole("button", { name: `방 ${nextRoomId}` });
    expect(container).not.toHaveTextContent(roomId);
    expect(rooms.mock.calls[1]?.[0]).toBeUndefined();
  });
  it("aborts an old detail request and ignores its late success after the auth revision changes", async () => {
    let complete!: (value: OperationInvocationDetail) => void;
    const rooms = vi.fn().mockResolvedValueOnce({ items: [room], next_cursor: null }).mockResolvedValue({ items: [], next_cursor: null });
    const readInvocation = vi.fn().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const api = apiFixture({ rooms, invocation: readInvocation });
    const { rerender, container } = render(<OperationsPage api={api} authRevision={0} />);
    fireEvent.click(await screen.findByRole("button", { name: `방 ${roomId}` }));
    fireEvent.click(await screen.findByRole("button", { name: `실행 ${invocationId}` }));
    await waitFor(() => expect(readInvocation).toHaveBeenCalledTimes(1));
    const previousSignal = readInvocation.mock.calls[0]?.[1] as AbortSignal;
    rerender(<OperationsPage api={api} authRevision={1} />);
    expect(previousSignal.aborted).toBe(true);
    await waitFor(() => expect(rooms).toHaveBeenCalledTimes(2));
    await act(async () => complete({ room_id: roomId, invocation, attempts: [], usage_by_provider: [] }));
    expect(container).not.toHaveTextContent(roomId); expect(container).not.toHaveTextContent(invocationId);
    expect(screen.queryByRole("heading", { name: "실행 기록 상세" })).not.toBeInTheDocument();
  });
  it("also clears the old snapshot when the supplied API object changes", async () => {
    const api = apiFixture();
    let complete!: (value: OperationRooms) => void;
    const nextApi = apiFixture({ rooms: vi.fn().mockImplementation(() => new Promise(resolve => { complete = resolve; })) });
    const { rerender, container } = render(<OperationsPage api={api} authRevision={0} />);
    await screen.findByRole("button", { name: `방 ${roomId}` });
    rerender(<OperationsPage api={nextApi} authRevision={0} />);
    expect(container).not.toHaveTextContent(roomId);
    await waitFor(() => expect(nextApi.rooms).toHaveBeenCalledTimes(1));
    await act(async () => complete({ items: [], next_cursor: null }));
    expect(container).not.toHaveTextContent(roomId);
  });
});
