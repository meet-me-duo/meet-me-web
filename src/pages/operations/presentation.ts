import type { OperationDiagnostics, OperationRoom } from "../../api/operations";
export const assessment = { CLEAR: "명확", NEEDS_REVIEW: "보완 필요", INDETERMINATE: "판단 유보" };
export const modeLabel = { REMOTE: "온라인", IN_PERSON: "대면", EITHER: "대면·온라인 모두 가능" };
export function stamp(value: string | null, zone = "Asia/Seoul", timeOnly = false) {
  if (!value) return "시각 미기록";
  try {
    return new Intl.DateTimeFormat("ko-KR", { timeZone: zone, ...(timeOnly ? {} : { month: "long", day: "numeric" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  } catch { return "시각 확인 필요"; }
}
export function dateRange(room: OperationRoom) {
  const end = new Date(room.search_end_date + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() - 1);
  const pretty = (value: string) => value.split("-").map(Number).join(". ") + ".";
  return Number.isNaN(end.valueOf()) ? "기간 미기록" : `${pretty(room.search_start_date)} — ${pretty(end.toISOString().slice(0, 10))}`;
}
export function roomStatus(room: OperationRoom): { label: string; tone: string; group: string } {
  if (room.current_analysis_confirmed) return { label: "확정", tone: "gray", group: "complete" };
  if (room.collection_status === "COLLECTING") return { label: "입력 중", tone: "blue", group: "progress" };
  return analysisStatus(room.current_run_status);
}
export function analysisStatus(status: string | null): { label: string; tone: string; group: string } {
  if (status === "COMPLETED") return { label: "분석 완료", tone: "green", group: "complete" };
  if (status === "ANALYSIS_DELAYED") return { label: "분석 지연", tone: "amber", group: "attention" };
  if (status === "DEAD_LETTERED") return { label: "작업 격리 · DLQ", tone: "red", group: "attention" };
  if (status === "STRUCTURING" || status === "MATCHING") return { label: "분석 중", tone: "blue", group: "progress" };
  return { label: "분석 대기", tone: "blue", group: "progress" };
}
export function canReanalyze(room: OperationRoom, view: OperationDiagnostics) {
  return room.collection_status === "CLOSED" && room.current_analysis_confirmed === false && room.has_open_revision_round === false &&
    typeof room.state_version === "number" && Number.isSafeInteger(room.state_version) && room.state_version >= 0 && room.state_version < Number.MAX_SAFE_INTEGER &&
    view.scope === "FROZEN_ANALYSIS" && view.analysis?.active === true && view.analysis.id === room.active_analysis_id &&
    ["COMPLETED", "ANALYSIS_DELAYED", "DEAD_LETTERED"].includes(view.analysis.status) &&
    ["COMPLETED", "ANALYSIS_DELAYED", "DEAD_LETTERED"].includes(room.current_run_status ?? "");
}
