import { useId, useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck, CircleHelp, CircleX } from "lucide-react";
import type { RecommendationParticipantStatusView } from "./recommendationView";

const statusLabels = {
  AVAILABLE: { label: "가능", Icon: CircleCheck },
  UNAVAILABLE: { label: "불가", Icon: CircleX },
  UNKNOWN: { label: "확인 필요", Icon: CircleHelp },
};

export function RecommendationParticipantStatuses({ participants, notice }: { participants?: RecommendationParticipantStatusView[]; notice?: string }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!participants?.length) return null;
  const remaining = participants.length - 4;
  const visibleParticipants = expanded ? participants : participants.slice(0, 4);
  const hint = notice || (participants.some(participant => participant.status === "UNKNOWN") ? "확인 필요: 일정이나 장소 조건을 더 확인해야 해요." : undefined);
  const ToggleIcon = expanded ? ChevronUp : ChevronDown;
  return <div className="recommendation-participants">
    <p className="recommendation-participants-heading">참가자별 가능 여부 <span>가능한 범위 전체 기준</span></p>
    <ul id={listId} className="recommendation-participant-list" aria-label="참가자별 가능 여부">
      {visibleParticipants.map(participant => {
        const { label, Icon } = statusLabels[participant.status] ?? statusLabels.UNKNOWN;
        return <li key={participant.participantRef} data-slot="badge" className={`participant-status participant-status-${participant.status.toLowerCase()}`}>
          <span className="recommendation-participant-name" title={participant.displayName}>{participant.displayName}</span>
          <span className="participant-status-label"><Icon size={14} aria-hidden="true" />{label}</span>
        </li>;
      })}
    </ul>
    {remaining > 0 && <button type="button" className="button secondary wide recommendation-participants-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(previous => !previous)}>
      {expanded ? "접기" : `나머지 ${remaining}명 더보기`}<ToggleIcon size={16} aria-hidden="true" />
    </button>}
    {hint && <p className="recommendation-participants-hint">{hint}</p>}
  </div>;
}
