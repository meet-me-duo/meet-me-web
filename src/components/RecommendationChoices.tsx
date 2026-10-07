import type { RecommendationOptionView, RecommendationSelection } from "./recommendationView";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, MapPin, Monitor, Users } from "lucide-react";
import { formatRecommendationInstant, formatRecommendationRange, recommendationInputValue, localDateTimeInstants, validateSelection } from "../utils/recommendationTime";
export type { RecommendationOptionView, RecommendationVariantView, RecommendationSelection } from "./recommendationView";

export interface RecommendationChoicesProps {
  contextKey: string;
  options: RecommendationOptionView[];
  alternatives?: RecommendationOptionView[];
  timeZone: string;
  canConfirm: boolean;
  pending?: boolean;
  onConfirm: (selection: RecommendationSelection) => void | Promise<void>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
}

export function RecommendationChoices(props: RecommendationChoicesProps) {
  const identity = JSON.stringify([props.contextKey, props.timeZone, props.canConfirm]);
  return <ChoicesSession key={identity} {...props} />;
}

function ChoicesSession({ options, alternatives = [], timeZone, canConfirm, pending = false, onConfirm, hasMore, loadingMore, onLoadMore }: RecommendationChoicesProps) {
  const primary = options.slice(0, 3);
  const other = [...options.slice(3), ...alternatives];
  const allOptions = [...primary, ...other];
  const [showOther, setShowOther] = useState(false);
  const [requestingMore, setRequestingMore] = useState(false);
  const moreLock = useRef(false);
  const [chosen, setChosen] = useState<{ optionId: string; variantId: string; snapshot: string } | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [exactBounds, setExactBounds] = useState<{ startAt: string; endAt: string } | null>(null);
  const [startInstant, setStartInstant] = useState("");
  const [endInstant, setEndInstant] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const option = allOptions.find(item => item.id === chosen?.optionId);
  const incomingVariant = option?.variants.find(item => item.id === chosen?.variantId);
  const variant = chosen && JSON.stringify(incomingVariant) === chosen.snapshot ? incomingVariant : undefined;
  const starts = localDateTimeInstants(start, timeZone);
  const ends = localDateTimeInstants(end, timeZone);
  const selectedStart = exactBounds?.startAt || (starts.length === 1 ? starts[0]! : starts.includes(startInstant) ? startInstant : "");
  const selectedEnd = exactBounds?.endAt || (ends.length === 1 ? ends[0]! : ends.includes(endInstant) ? endInstant : "");
  const valid = !!variant && validateSelection(selectedStart, selectedEnd, variant);
  const invalidStart = !!start && (!selectedStart || (!!variant && (!validateSelection(selectedStart, variant.endAt, variant) || (!!selectedEnd && !validateSelection(selectedStart, selectedEnd, variant)))));
  const invalidEnd = !!end && (!selectedEnd || (!!variant && (!validateSelection(variant.startAt, selectedEnd, variant) || (!!selectedStart && !validateSelection(selectedStart, selectedEnd, variant)))));
  const busy = pending || submitting;
  useEffect(() => {
    if (chosen) heading.current?.focus();
    else if (returnFocus.current) { buttons.current.get(returnFocus.current)?.focus(); returnFocus.current = null; }
  }, [chosen]);
  useEffect(() => {
    if (!pending) { submitLock.current = false; setSubmitting(false); }
  }, [pending]);
  useEffect(() => {
    if (!loadingMore) { moreLock.current = false; setRequestingMore(false); }
  }, [loadingMore]);
  useEffect(() => {
    if (chosen && !variant) { setChosen(null); setExactBounds(null); setStart(""); setEnd(""); setStartInstant(""); setEndInstant(""); submitLock.current = false; setSubmitting(false); }
  }, [chosen, variant]);

  if (variant && option) return <section className="actual-time-form glass-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} tabIndex={-1} ref={heading}>{primary.some(item => item.id === option.id) ? "추천안" : "다른 가능한 시간"} {option.rank}의 실제 일정 선택</h3>
    <p className="field-hint">시간대: {timeZone}. 가능한 범위 안에서 실제 시작·종료 시간을 직접 선택해 주세요.</p>
    <p className="recommendation-range"><CalendarDays size={18} aria-hidden="true" /> 가능한 범위 · {formatRecommendationRange(variant.startAt, variant.endAt, timeZone)}</p>
    <p>{variant.attendanceCount}/{variant.totalParticipants}명 참석 가능 · {variant.meetingMode === "REMOTE" ? "온라인 · 접속 정보 별도 공지" : `대면 · ${variant.place ?? "장소 협의"}`}</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (!canConfirm || !valid || busy || submitLock.current) return;
      submitLock.current = true; setSubmitting(true);
      const result = onConfirm({ optionId: option.id, variantId: variant.id, startAt: selectedStart, endAt: selectedEnd });
      if (result) void result.catch(() => {}).finally(() => { submitLock.current = false; setSubmitting(false); });
    }}>
      <button type="button" className="button secondary" disabled={busy} onClick={() => {
        setExactBounds({ startAt: variant.startAt, endAt: variant.endAt });
        setStart(recommendationInputValue(variant.startAt, timeZone));
        setEnd(recommendationInputValue(variant.endAt, timeZone));
        setStartInstant(""); setEndInstant("");
      }}>가능한 범위 전체 선택</button>
      {exactBounds?.startAt && exactBounds?.endAt && <p className="field-hint">전체 범위의 정확한 시작·종료를 선택했어요. 아래 미리보기에서 초 미만 시각까지 확인해 주세요. 입력을 수정하면 해당 시각을 직접 선택한 값으로 바꿔요.</p>}
      <div className="actual-time-inputs">
        <label className="field"><span>시작 시간</span><input type="datetime-local" step="1" value={start} disabled={busy} required aria-describedby={`${id}-hint`} aria-invalid={invalidStart} onChange={event => { setStart(event.target.value); setStartInstant(""); setExactBounds(previous => previous ? { ...previous, startAt: "" } : null); }} /></label>
        <label className="field"><span>종료 시간</span><input type="datetime-local" step="1" value={end} disabled={busy} required aria-describedby={`${id}-hint`} aria-invalid={invalidEnd} onChange={event => { setEnd(event.target.value); setEndInstant(""); setExactBounds(previous => previous ? { ...previous, endAt: "" } : null); }} /></label>
      </div>
      {starts.length > 1 && !exactBounds?.startAt && <label className="field"><span>시작 시간의 UTC 오프셋</span><select value={startInstant} disabled={busy} onChange={event => setStartInstant(event.target.value)}><option value="">두 시각 중 선택해 주세요</option>{starts.map(instant => <option value={instant} key={instant}>{formatRecommendationInstant(instant, timeZone)}</option>)}</select></label>}
      {ends.length > 1 && !exactBounds?.endAt && <label className="field"><span>종료 시간의 UTC 오프셋</span><select value={endInstant} disabled={busy} onChange={event => setEndInstant(event.target.value)}><option value="">두 시각 중 선택해 주세요</option>{ends.map(instant => <option value={instant} key={instant}>{formatRecommendationInstant(instant, timeZone)}</option>)}</select></label>}
      <p id={`${id}-hint`} className="field-hint" role="status">{(start && starts.length === 0) || (end && ends.length === 0) ? "이 시간대에 존재하지 않거나 올바르지 않은 시각이에요." : start && end && !valid ? "가능한 범위 안에서 시작·종료 시간을 선택해 주세요." : valid ? "선택한 실제 시작·종료를 확인한 뒤 확정해 주세요." : "소요 시간은 자동으로 설정하지 않아요. 종료 시간도 선택해 주세요."}</p>
      {valid && <p className="selected-time" role="status">확정할 일정 · {formatRecommendationRange(selectedStart, selectedEnd, timeZone)}</p>}
      <div className="actual-time-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { returnFocus.current = option.id; setChosen(null); setExactBounds(null); setStart(""); setEnd(""); }}>추천안으로 돌아가기</button><button type="submit" className="button primary" disabled={!canConfirm || !valid || busy}>{busy ? "확정 중…" : "일정 확정"}</button></div>
    </form>
  </section>;

  return <div className="recommendation-choices">
    <p className="field-hint">시간대: {timeZone}. 각 추천안의 가능한 시간·참석 인원·방식을 확인해 주세요.</p>
    <div className="candidate-list">{(showOther ? allOptions : primary).map(item => <article key={item.id} className="candidate-card recommendation-card" aria-labelledby={`${id}-${item.id}`}>
      <h3 id={`${id}-${item.id}`}>{primary.some(option => option.id === item.id) ? "추천안" : "다른 가능한 시간"} {item.rank}</h3>
      <fieldset className="recommendation-variants"><legend>가능한 방식과 장소</legend>{item.variants.map(choice => <label className="recommendation-variant" key={choice.id}>
        <input type="radio" name={`${id}-${item.id}-variant`} checked={(item.variants.find(variant => variant.id === variants[item.id]) ?? item.variants[0])?.id === choice.id} disabled={!canConfirm || pending} onChange={() => setVariants(previous => ({ ...previous, [item.id]: choice.id }))} />
        <span><span className="candidate-meta"><span><Users size={17} aria-hidden="true" /> {choice.attendanceCount}/{choice.totalParticipants}명 참석 가능</span><span>{choice.meetingMode === "REMOTE" ? <Monitor size={17} aria-hidden="true" /> : <MapPin size={17} aria-hidden="true" />} {choice.meetingMode === "REMOTE" ? "온라인 · 접속 정보 별도 공지" : `대면 · ${choice.place ?? "장소 협의"}`}</span></span><span className="recommendation-range">가능한 범위 · {formatRecommendationRange(choice.startAt, choice.endAt, timeZone)}</span></span>
      </label>)}</fieldset>
      {canConfirm && <button ref={button => { if (button) buttons.current.set(item.id, button); else buttons.current.delete(item.id); }} type="button" className="button primary wide" disabled={pending || !item.variants.length} onClick={() => { const selected = item.variants.find(variant => variant.id === variants[item.id]) ?? item.variants[0]; if (selected) setChosen({ optionId: item.id, variantId: selected.id, snapshot: JSON.stringify(selected) }); }}>이 시간 선택</button>}
    </article>)}</div>
    {(hasMore || (!showOther && other.length > 0)) && <button type="button" className="button secondary more-times" disabled={loadingMore || requestingMore || pending} onClick={() => {
      if (moreLock.current) return;
      setShowOther(true);
      if (!onLoadMore) return;
      moreLock.current = true; setRequestingMore(true);
      const request = onLoadMore();
      if (request) void request.catch(() => {}).finally(() => { moreLock.current = false; setRequestingMore(false); });
    }}>{loadingMore || requestingMore ? "다른 가능한 시간 불러오는 중…" : "다른 가능한 시간 보기"}</button>}
  </div>;
}
