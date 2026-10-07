import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalysisRecoveryPanel from "./AnalysisRecoveryPanel";

afterEach(cleanup);

describe("analysis recovery presentation awaiting the generated server contract", () => {
  it("hides recovery when the server cannot support it", () => {
    const open = vi.fn(); const analyze = vi.fn();
    render(<AnalysisRecoveryPanel available={false} editing={false} host pending={false} onOpen={open} onAnalyze={analyze} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
  });
  it.each([false, true])("shows the host action for editing=%s", editing => {
    const open = vi.fn(); const analyze = vi.fn();
    const view = render(<AnalysisRecoveryPanel available editing={editing} host pending={false} onOpen={open} onAnalyze={analyze} />);
    fireEvent.click(screen.getByRole("button", { name: editing ? "수정한 조건으로 다시 분석" : "조건 수정 열기" }));
    expect(editing ? analyze : open).toHaveBeenCalledTimes(1);
    expect(editing ? open : analyze).not.toHaveBeenCalled();
    view.rerender(<AnalysisRecoveryPanel available editing={editing} host pending onOpen={open} onAnalyze={analyze} />);
    expect(screen.getByRole("button", { name: "요청 중…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "요청 중…" }));
    expect(editing ? analyze : open).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("does not expose host commands to members (editing=%s)", editing => {
    render(<AnalysisRecoveryPanel available editing={editing} host={false} pending={false} onOpen={vi.fn()} onAnalyze={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    if (editing) expect(screen.getByText(/바꾸지 않은 입력은 그대로 다시 사용/)).toBeInTheDocument();
  });
  it("shows the command failure without adding an input form", () => {
    render(<AnalysisRecoveryPanel available editing host pending={false} error="합성 재분석 장애" onOpen={vi.fn()} onAnalyze={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("합성 재분석 장애");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
