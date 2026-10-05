import { CalendarDays, Check, MapPin, Monitor, Users } from "lucide-react";
import type { Candidate } from "../api/types";
import { formatDateTime } from "../utils/time";

export function CandidateCard({ candidate, canConfirm, pending, onConfirm, confirmed = false, selectionWarning }: {
  candidate: Candidate;
  canConfirm: boolean;
  pending?: boolean;
  onConfirm?: () => void;
  confirmed?: boolean;
  selectionWarning?: string;
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
        <span>{candidate.meeting_mode === "REMOTE" ? <Monitor size={17} /> : <MapPin size={17} />} {candidate.meeting_mode === "REMOTE" ? "비대면" : `후보 지역 · ${candidate.place?.display_name ?? "지역 협의"}`}</span>
      </div>
      <div className="time-options">
        {candidate.time_ranges.map((range) => (
          <span key={range.start_at}><CalendarDays size={15} /> {formatDateTime(range.start_at)}–{new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(range.end_at))}</span>
        ))}
      </div>
      <p className="candidate-limit">위 시간은 가능한 후보 시간이에요. {candidate.meeting_mode === "REMOTE" ? "실제 모임 날짜·시간과 접속 정보는 주최자가 따로 공지해요." : "실제 모임 날짜·시간과 상세 장소는 주최자가 따로 공지해요."}</p>
      {selectionWarning && <p className="candidate-warning">{selectionWarning}</p>}
      {confirmed && <div className="confirmed-label"><Check size={18} /> 선택한 플랜</div>}
      {canConfirm && <button type="button" className="button primary wide" onClick={onConfirm} disabled={pending}>{pending ? "선택 중…" : `Plan ${candidate.plan_type} 선택`}</button>}
    </article>
  );
}
