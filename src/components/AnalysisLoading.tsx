import { AnalysisOrb } from "./AnalysisOrb";

export function AnalysisLoading({ phase, title }: { phase: "checking" | "clarification" | "analysis"; title: string }) {
  return <section className="analysis-loading glass-card" aria-label="분석 진행 상태">
    <AnalysisOrb phase={phase} size={64} />
    <div role="status" aria-live="polite" aria-atomic="true"><h2>{title}</h2></div>
  </section>;
}
