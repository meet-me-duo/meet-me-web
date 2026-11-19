import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import OperationsPage from "./OperationsPage";
import { OperationsError, type OperationDiagnostics, type OperationReanalysisReceipt, type OperationsApi } from "../api/operations";
import { fixtureOperationsApi, operatorFixture } from "../testing/operatorFixture";

const sample = operatorFixture();
function mount(overrides: Partial<OperationsApi> = {}) {
  const base = fixtureOperationsApi();
  const api = { ...base, rooms: vi.fn(base.rooms), room: vi.fn(base.room), analyses: vi.fn(base.analyses), diagnostics: vi.fn(base.diagnostics), reanalyze: vi.fn(base.reanalyze), ...overrides };
  return { api, ...render(<OperationsPage api={api} />) };
}
async function openRoom() { fireEvent.click(await screen.findByRole("button", { name: sample.room.title! })); await screen.findByRole("heading", { name: /입력과 보완 내용/ }); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("approved operator dashboard", () => {
  it("shows the selected past outcome rather than borrowing the current room failure", async () => {
    const data = operatorFixture();
    data.room.current_run_status = "DEAD_LETTERED";
    data.roomDetail.room = data.room;
    data.history.items[0]!.status = "DEAD_LETTERED";
    const diagnostics = vi.fn(async (_room: string, id: string | null): Promise<OperationDiagnostics> => ({
      ...data.diagnostics, analysis: data.history.items.find(item => item.id === id)!, results: [],
    }));
    const { api } = mount({ rooms: vi.fn().mockResolvedValue({ items: [data.room], next_cursor: null }), room: vi.fn().mockResolvedValue(data.roomDetail), analyses: vi.fn().mockResolvedValue(data.history), diagnostics });
    await screen.findByText("작업 격리 · DLQ");
    expect(api.diagnostics).not.toHaveBeenCalled();
    await openRoom();
    await screen.findByRole("heading", { name: "작업 격리 · DLQ 확인 필요" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: data.history.items[1]!.id } });
    await screen.findByRole("heading", { name: "분석 완료 · 저장된 후보 없음" });
    expect(screen.queryByRole("heading", { name: "작업 격리 · DLQ 확인 필요" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 분석" })).toBeDisabled();
  });
  it.each([[401, "운영자 인증이 필요합니다."], [403, "운영 조회 권한이 없습니다."], [503, "운영 요약을 일시적으로 조회할 수 없습니다."], [404, "조회 대상을 찾을 수 없습니다."], [400, "조회 요청을 확인해 주세요."]] as const)("retains the fixed %s failure without arbitrary response or grant controls", async (status, message) => {
    const { container, api } = mount({ rooms: vi.fn().mockRejectedValue(Object.assign(new OperationsError(status), { detail: "PRIVATE_BODY", message: "PRIVATE_BODY" })) });
    await screen.findByText(message);
    expect(container).not.toHaveTextContent("PRIVATE_BODY"); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(api.room).not.toHaveBeenCalled(); expect(api.reanalyze).not.toHaveBeenCalled();
  });
  it("has loading and empty states and retains server-driven page cursors", async () => {
    let done!: (value: { items: []; next_cursor: null }) => void;
    mount({ rooms: vi.fn().mockImplementation(() => new Promise(resolve => { done = resolve; })) });
    expect(screen.getByRole("status")).toHaveTextContent("불러");
    await act(async () => done({ items: [], next_cursor: null }));
    await screen.findByText("조회할 모임이 없어요.");
    expect(screen.queryByRole("button", { name: "다음 모임" })).not.toBeInTheDocument();
  });
  it("shows title dates status and local-only filters without exposing internal room IDs", async () => {
    const { api, container } = mount(); await screen.findByRole("button", { name: sample.room.title! });
    expect(container).not.toHaveTextContent(sample.room.id);
    expect(screen.getByText("2027. 1. 4. — 2027. 1. 8.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "다른 제목" } });
    expect(screen.getByText("현재 페이지에 조건과 맞는 모임이 없어요.")).toBeInTheDocument();
    expect(api.rooms).toHaveBeenCalledTimes(1);
  });
  it("uses the actual selected analysis and shows original, linked answer and retry/fallback facts", async () => {
    const { api, container } = mount(); await openRoom();
    expect(api.diagnostics).toHaveBeenCalledWith(sample.room.id, sample.room.active_analysis_id, expect.any(AbortSignal));
    expect(container).toHaveTextContent(sample.diagnostics.inputs[1]!.raw_text!);
    expect(container).toHaveTextContent(sample.diagnostics.inputs[1]!.supplement!.answer!);
    expect(container).toHaveTextContent("보완 후 기록된 판정"); expect(container).toHaveTextContent("재시도"); expect(container).toHaveTextContent("대체 모델");
    expect(container).not.toHaveTextContent("최종 발행 성공");
  });
  it("never invents historical CLEAR and disables reanalysis for a past frozen analysis", async () => {
    const diagnostics = vi.fn(async (_room: string, id: string | null) => {
      const d = operatorFixture().diagnostics;
      const old = id !== sample.room.active_analysis_id;
      d.analysis = old ? sample.history.items[1]! : sample.history.items[0]!;
      if (old) d.inputs.forEach(input => input.checks.forEach(check => check.attempts.forEach(attempt => { attempt.classification = null; })));
      return d;
    });
    mount({ diagnostics }); await openRoom();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: sample.history.items[1]!.id } });
    await screen.findByText("이전 분석의 고정 입력과 결과예요. 다시 분석은 현재 분석에서 실행할 수 있어요.");
    expect(screen.getByRole("button", { name: "다시 분석" })).toBeDisabled();
    expect(screen.getAllByText("판정 미기록").length).toBeGreaterThan(0);
    expect(diagnostics.mock.calls.at(-1)?.[1]).toBe(sample.history.items[1]!.id);
  });
  it("does not write when opening or cancelling the confirmation dialog", async () => {
    const { api } = mount(); await openRoom();
    fireEvent.click(screen.getByRole("button", { name: "다시 분석" }));
    const modal = screen.getByRole("dialog", { name: "이 모임을 다시 분석할까요?" });
    expect(modal).toHaveTextContent("이전 기록은 보존");
    expect(api.reanalyze).not.toHaveBeenCalled();
    fireEvent.click(within(modal).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(api.reanalyze).not.toHaveBeenCalled();
  });
  it("submits the room state version and reloads the server-issued new analysis exactly once", async () => {
    const newId = "00000440-1111-4111-8111-000000000001";
    let finish!: (receipt: OperationReanalysisReceipt) => void;
    const run = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const diagnostic = vi.fn(async (_room: string, id: string | null): Promise<OperationDiagnostics> => ({
      ...operatorFixture().diagnostics, analysis: id === newId ? { ...sample.history.items[0]!, id: newId, status: "QUEUED" } : sample.history.items[0]!,
    }));
    mount({ reanalyze: run, diagnostics: diagnostic }); await openRoom();
    fireEvent.click(screen.getByRole("button", { name: "다시 분석" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "다시 분석" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const command = run.mock.calls[0]![1];
    expect(command).toEqual({ request_id: expect.any(String), source_analysis_id: sample.room.active_analysis_id, expected_state_version: 7 });
    await act(async () => finish({ request_id: command.request_id, source_analysis_id: command.source_analysis_id, analysis_id: newId, accepted_state_version: 8, accepted_at: "2027-01-04T01:39:00Z", analysis_contract_version: "schedule-dsl-response-6" }));
    await screen.findByText("재분석 요청을 접수했어요. 새 분석 상태를 확인하고 있어요.");
    expect(diagnostic.mock.calls.at(-1)?.[1]).toBe(newId); expect(run).toHaveBeenCalledTimes(1);
  });
  it.each([408, 429, 500, 502, 503, 504])("reuses the identical request after ambiguous HTTP %s, including after room navigation", async status => {
    const run = vi.fn().mockRejectedValue(new OperationsError(status));
    mount({ reanalyze: run }); await openRoom();
    fireEvent.click(screen.getByRole("button", { name: "다시 분석" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "다시 분석" }));
    await screen.findByRole("button", { name: "같은 요청으로 접수 확인" });
    fireEvent.click(screen.getByRole("button", { name: "모임 목록" }));
    await openRoom();
    fireEvent.click(await screen.findByRole("button", { name: "같은 요청으로 접수 확인" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run.mock.calls[1]![1]).toEqual(run.mock.calls[0]![1]);
  });
  it.each([{ current_analysis_confirmed: true }, { has_open_revision_round: true }, { collection_status: "COLLECTING" as const }, { state_version: Number.MAX_SAFE_INTEGER }])("disables fresh commands for ineligible state %j", async patch => {
    const data = operatorFixture(); data.roomDetail.room = { ...data.room, ...patch };
    const diag = { ...data.diagnostics, scope: patch.collection_status ? "CURRENT_COLLECTION" as const : "FROZEN_ANALYSIS" as const, analysis: patch.collection_status ? null : data.diagnostics.analysis };
    mount({ room: vi.fn().mockResolvedValue(data.roomDetail), diagnostics: vi.fn().mockResolvedValue(diag) }); await openRoom();
    expect(screen.getByRole("button", { name: "다시 분석" })).toBeDisabled();
  });
  it("allows history paging again after navigation cancels a pending history read", async () => {
    let complete!: (value: typeof sample.history) => void;
    const signals: AbortSignal[] = [];
    const history = vi.fn(async (_room: string, cursor?: string, signal?: AbortSignal) => {
      if (cursor && signal) signals.push(signal);
      return cursor ? new Promise<typeof sample.history>(resolve => { complete = resolve; })
        : { ...operatorFixture().history, next_cursor: "next" };
    });
    mount({ analyses: history }); await openRoom();
    fireEvent.click(screen.getByRole("button", { name: "이전 분석 이력 더보기" }));
    await screen.findByRole("button", { name: "이력 조회 중…" });
    const signal = signals.at(-1);
    fireEvent.click(screen.getByRole("button", { name: "모임 목록" }));
    await openRoom();
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "이전 분석 이력 더보기" })).toBeEnabled();
    await act(async () => complete({ items: [], next_cursor: null }));
    expect(screen.getByRole("button", { name: "이전 분석 이력 더보기" })).toBeEnabled();
  });
  it("keeps snapshots and commands out of persistent storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    mount(); await openRoom();
    expect(storage).not.toHaveBeenCalled(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
