import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OperationsPage from "./OperationsPage";
import { fixtureOperationsApi, operatorFixture } from "../testing/operatorFixture";
import type { OperationDiagnostics, OperationRooms } from "../api/operations";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("operator protected snapshots follow account context", () => {
  it("clears displayed input immediately when revision changes and reloads", async () => {
    const sample = operatorFixture(); let finish!: (value: OperationRooms) => void;
    const rooms = vi.fn().mockResolvedValueOnce({ items: [sample.room], next_cursor: null }).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const api = fixtureOperationsApi({ rooms }); const view = render(<OperationsPage api={api} authRevision={0} />);
    fireEvent.click(await screen.findByRole("button", { name: sample.room.title! }));
    await screen.findAllByText(sample.diagnostics.inputs[0]!.raw_text!);
    view.rerender(<OperationsPage api={api} authRevision={1} />);
    expect(view.container).not.toHaveTextContent(sample.diagnostics.inputs[0]!.raw_text!);
    await waitFor(() => expect(rooms).toHaveBeenCalledTimes(2));
    await act(async () => finish({ items: [], next_cursor: null }));
    expect(view.container).not.toHaveTextContent(sample.room.title!);
  });
  it("aborts and suppresses a late diagnostic from the previous actor", async () => {
    const sample = operatorFixture(); let finish!: (value: OperationDiagnostics) => void;
    const diagnostics = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const rooms = vi.fn().mockResolvedValueOnce({ items: [sample.room], next_cursor: null }).mockResolvedValue({ items: [], next_cursor: null });
    const api = fixtureOperationsApi({ diagnostics, rooms }); const view = render(<OperationsPage api={api} authRevision={0} />);
    fireEvent.click(await screen.findByRole("button", { name: sample.room.title! }));
    await waitFor(() => expect(diagnostics).toHaveBeenCalledTimes(1));
    const signal = diagnostics.mock.calls[0]![2] as AbortSignal;
    view.rerender(<OperationsPage api={api} authRevision={1} />);
    expect(signal.aborted).toBe(true);
    await act(async () => finish(sample.diagnostics));
    expect(view.container).not.toHaveTextContent(sample.diagnostics.inputs[0]!.raw_text!);
    expect(view.container).not.toHaveTextContent(sample.room.title!);
  });
  it("also clears the old snapshot for a replaced API object", async () => {
    const sample = operatorFixture(); const first = fixtureOperationsApi();
    const second = fixtureOperationsApi({ rooms: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) });
    const view = render(<OperationsPage api={first} />);
    await screen.findByRole("button", { name: sample.room.title! });
    view.rerender(<OperationsPage api={second} />);
    expect(view.container).not.toHaveTextContent(sample.room.title!);
    await screen.findByText("조회할 모임이 없어요.");
  });
});
