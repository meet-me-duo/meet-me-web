import { RefreshCw } from "lucide-react";

type Props = {
  available: boolean;
  editing: boolean;
  host: boolean;
  pending: boolean;
  error?: string;
  onOpen: () => void;
  onAnalyze: () => void;
};

export default function AnalysisRecoveryPanel({ available, editing, host, pending, error, onOpen, onAnalyze }: Props) {
  if (!available) return null;
  return <section className="glass-card side-card analysis-recovery">
    <h2>{editing ? "조건을 수정하는 중이에요" : "저장한 조건을 수정해 다시 시도할 수 있어요"}</h2>
    <p>{editing ? "각자 자신의 저장 입력을 수정하고 저장해 주세요. 바꾸지 않은 입력은 그대로 다시 사용해요." : host ? "모임과 저장한 입력을 유지하면서 참여자가 자신의 조건을 수정할 수 있어요." : "주최자가 조건 수정을 열면 자신의 저장 입력을 수정할 수 있어요."}</p>
    {editing && <p className="field-hint">수정 중에는 이전 후보를 선택할 수 없어요. 주최자가 다시 분석하면 새 결과를 확인할 수 있어요.</p>}
    {host && <button className="button primary" disabled={pending} onClick={editing ? onAnalyze : onOpen}><RefreshCw size={17} />{pending ? "요청 중…" : editing ? "수정한 조건으로 다시 분석" : "조건 수정 열기"}</button>}
    {error && <p className="alert error" role="alert">{error}</p>}
  </section>;
}
