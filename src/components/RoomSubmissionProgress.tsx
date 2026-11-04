interface Props {
  submittedCount?: unknown;
  expectedParticipants?: unknown;
  closed: boolean;
  stale?: boolean;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Presentation only: the caller supplies the server's aggregate, never a participant list. */
export function RoomSubmissionProgress({ submittedCount, expectedParticipants, closed, stale = false }: Props) {
  const knownCount = count(submittedCount);
  const target = count(expectedParticipants) && expectedParticipants > 0 ? expectedParticipants : null;
  const noTarget = expectedParticipants === null;
  const ratio = knownCount && target !== null ? Math.min(1, submittedCount / target) : null;
  const numerator = knownCount ? String(submittedCount) : "—";
  const stacked = knownCount && target !== null && (numerator.length > 1 || String(target).length > 1);
  const value = knownCount ? target === null ? `${submittedCount}명` : `${submittedCount}/${target}명` : "—";
  const summary = knownCount
    ? target === null ? `${submittedCount}명 제출${noTarget ? ", 목표 인원 없음" : ", 목표 인원 확인 불가"}` : `목표 ${target}명 중 ${submittedCount}명 제출`
    : "제출 인원 확인 불가";
  const label = `${closed ? "입력 마감" : "입력 수집 중"} · ${stale ? "마지막 확인한 집계 · " : ""}${summary}`;

  return <><div className="room-submission-progress" role="img" aria-label={label}>
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="submission-progress-track" cx="32" cy="32" r="28" fill="none" strokeWidth="8" />
      {ratio !== null && ratio > 0 && <circle className="submission-progress-value" cx="32" cy="32" r="28" fill="none" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${ratio * 100} 100`} transform="rotate(-90 32 32)" />}
    </svg>
    <span className="submission-progress-center" aria-hidden="true">
      <strong className={`submission-progress-number${stacked ? " is-stacked" : ""}`}>{stacked ? <><span>{numerator}/</span><span>{target}명</span></> : value}</strong>
      {!stacked && <span className="submission-progress-caption">{stale ? "마지막 확인" : knownCount ? "제출" : "집계 미확인"}</span>}
    </span>
  </div>{stacked && stale && <p className="room-submission-stale-note">마지막으로 확인한 제출 인원이에요.</p>}</>;
}
