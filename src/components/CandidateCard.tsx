import { CalendarDays, Check, MapPin, Monitor, Users } from "lucide-react";
import type { Candidate } from "../api/types";
import { formatDateTime } from "../utils/time";

export function CandidateCard({ candidate, canConfirm, pending, onConfirm, confirmed = false }: {
  candidate: Candidate;
  canConfirm: boolean;
  pending?: boolean;
  onConfirm?: () => void;
  confirmed?: boolean;
}) {
  return (
    <article className={`candidate-card plan-${candidate.plan_type.toLowerCase()} ${confirmed ? "confirmed" : ""}`}>
      <div className="candidate-top">
        <span className="plan-chip">Plan {candidate.plan_type}</span>
        <span className="rank">추천 {candidate.rank}순위</span>
      </div>
      <h3>{candidate.summary}</h3>
      <div className="candidate-meta">
        <span><Users size={17} /> {candidate.attendance_count}/{candidate.total_participants}명 참석 가능</span>
        <span>{candidate.meeting_mode === "REMOTE" ? <Monitor size={17} /> : <MapPin size={17} />} {candidate.meeting_mode === "REMOTE" ? "비대면" : candidate.place?.display_name ?? "장소 협의"}</span>
      </div>
      <div className="time-options">
        {candidate.time_ranges.map((range) => (
          <span key={range.start_at}><CalendarDays size={15} /> {formatDateTime(range.start_at)}–{new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(range.end_at))}</span>
        ))}
      </div>
      {confirmed && <div className="confirmed-label"><Check size={18} /> 최종 확정된 일정</div>}
      {canConfirm && <button type="button" className="button primary wide" onClick={onConfirm} disabled={pending}>{pending ? "확정 중…" : `Plan ${candidate.plan_type}로 확정`}</button>}
    </article>
  );
}
