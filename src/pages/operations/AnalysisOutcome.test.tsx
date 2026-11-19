import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { operatorFixture } from "../../testing/operatorFixture";
import { AnalysisOutcome } from "./DiagnosticViews";
import { analysisStatus } from "./presentation";

afterEach(cleanup);

describe("operator analysis outcomes", () => {
  it("separates completed empty results from a technical failure without asserting all inputs were understood", () => {
    const data = operatorFixture().diagnostics;
    data.analysis!.status = "COMPLETED";
    data.results = [];
    render(<AnalysisOutcome data={data} />);
    expect(screen.getByRole("heading", { name: "분석 완료 · 저장된 후보 없음" })).toBeInTheDocument();
    expect(screen.getByText(/입력 미반영 여부/)).toBeInTheDocument();
    expect(screen.queryByText(/모든 입력.*성공/)).not.toBeInTheDocument();
  });
  it.each(["ANALYSIS_DELAYED", "DEAD_LETTERED"] as const)("does not classify %s as no matching time even with no results", status => {
    const data = operatorFixture().diagnostics;
    data.analysis!.status = status;
    data.results = [];
    render(<AnalysisOutcome data={data} />);
    expect(screen.getByRole("heading", { name: status === "ANALYSIS_DELAYED" ? "분석 지연 · 기술적 사유로 종결" : "작업 격리 · DLQ 확인 필요" })).toBeInTheDocument();
    expect(screen.queryByText("분석 완료 · 저장된 후보 없음")).not.toBeInTheDocument();
    if (status === "DEAD_LETTERED") expect(screen.getByText(/DLQ 원문 재처리와는 다른 작업/)).toBeInTheDocument();
  });
  it("shows results without claiming every input succeeded", () => {
    const data = operatorFixture().diagnostics;
    data.analysis!.status = "COMPLETED";
    render(<AnalysisOutcome data={data} />);
    expect(screen.getByRole("heading", { name: "분석 완료 · 저장된 후보 있음" })).toBeInTheDocument();
    expect(screen.getByText(/입력 미반영 여부/)).toBeInTheDocument();
  });
  it("does not turn a truncated empty response into an authoritative no-candidate outcome", () => {
    const data = operatorFixture().diagnostics;
    data.analysis!.status = "COMPLETED";
    data.results = []; data.results_truncated = true;
    render(<AnalysisOutcome data={data} />);
    expect(screen.getByRole("heading", { name: "분석 완료 · 결과 확인 필요" })).toBeInTheDocument();
    expect(screen.queryByText("분석 완료 · 저장된 후보 없음")).not.toBeInTheDocument();
  });
  it("does not infer an analysis result from the current collection", () => {
    const data = operatorFixture().diagnostics;
    data.scope = "CURRENT_COLLECTION";
    render(<AnalysisOutcome data={data} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
  it("keeps list completion neutral and distinguishes delayed from quarantined work", () => {
    expect(analysisStatus("COMPLETED").label).toBe("분석 완료");
    expect(analysisStatus("ANALYSIS_DELAYED")).toMatchObject({ label: "분석 지연", tone: "amber", group: "attention" });
    expect(analysisStatus("DEAD_LETTERED")).toMatchObject({ label: "작업 격리 · DLQ", tone: "red", group: "attention" });
  });
});
