import { AnalysisOrb } from "./AnalysisOrb";

export function AnalysisLoading({ title }: { title: string }) {
  return <section className="analysis-loading glass-card" aria-label="분석 진행 상태">
    <AnalysisOrb />
    <div role="status" aria-live="polite" aria-atomic="true"><h2>{title}</h2></div>
  </section>;
}
