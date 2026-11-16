import { Check, ChevronDown, ShieldCheck, Clock3 } from "lucide-react";
import type { OperationClassification, OperationDiagnostics, OperationInput, OperationQuestion } from "../../api/operations";
import { ExecutionDetail } from "../OperationsTechnicalDetails";
import { assessment, modeLabel, stamp } from "./presentation";

export function Pill({ text, tone = "gray" }: { text: string; tone?: string }) {
  return <span className={`ops-pill ops-${tone}`}>{text}</span>;
}
function Verdict({ value, label = "Jev 판정" }: { value: OperationClassification | null | undefined; label?: string }) {
  if (!value) return <div className="ops-assessment"><span>{label}</span><Pill text="판정 미기록" /></div>;
  const choice = value.semantic_assessment ?? value.assessment;
  return <div className="ops-assessment"><span>{label}</span><Pill text={assessment[choice]} tone={choice === "CLEAR" ? "green" : "amber"} />
    <span>{value.confidence === null ? "점수 미기록" : `모델 점수 ${value.confidence.toFixed(2)}`}</span>
    {value.assessment !== choice && <span>정규화 판정 · {assessment[value.assessment]}</span>}
    {value.effective_assessment !== choice && <span>서버 분기 · {value.effective_assessment ? assessment[value.effective_assessment] : "미도달"}</span>}
  </div>;
}
function Question({ data, zone }: { data: OperationQuestion; zone: string }) {
  return <div className="ops-question-block"><div className="ops-q-label">보완 질문 {!data.consumed && <span>· 이 분석에 답변 미반영</span>}</div>
    <p>{data.prompt}</p>
    {data.excerpt && <p className="ops-source-note">확인 대상: {data.excerpt}</p>}
    {data.source_raw_text && <details className="ops-records"><summary>질문이 나온 원문</summary><p className="ops-original">{data.source_raw_text}</p></details>}
    {data.choices.length > 0 && <ul>{data.choices.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    <div className="ops-answer"><div className="ops-q-label">참여자 답변 <span className="ops-answer-time">{data.answered_at ? stamp(data.answered_at, zone) : ""}</span></div>
      <p>{data.answer ?? "등록된 답변이 없어요."}</p></div>
  </div>;
}
export function InputCards({ data, zone }: { data: OperationDiagnostics; zone: string }) {
  return <div><div className="ops-section-heading"><h2>입력과 보완 내용 <span className="ops-count">{data.inputs.length}명</span></h2>
    <span className="ops-privacy"><ShieldCheck size={14} aria-hidden="true" />이름·연락처 가림</span></div>
    <div className="ops-inputs">{data.inputs.map((input, index) => <InputCard key={input.alias} input={input} index={index} zone={zone} />)}</div>
    {data.inputs.length === 0 && <p className="ops-card ops-empty">아직 저장된 입력이 없어요.</p>}
    {data.inputs_truncated && <p className="ops-detail-note">참여자 50명까지 표시하고 있어요.</p>}
    <p className="ops-source-note">{data.scope === "FROZEN_ANALYSIS" ? "선택한 분석에 사용된 고정 입력과 보완 답변이에요." : "현재 접수된 입력과 최근 사전검사 이력을 구분해 표시해요."}</p>
  </div>;
}
function InputCard({ input, index, zone }: { input: OperationInput; index: number; zone: string }) {
  const first = input.checks[0]?.attempts[0]?.classification;
  const lastCheck = input.checks.at(-1);
  const last = lastCheck?.attempts.at(-1)?.classification;
  const question = input.supplement ?? input.checks.filter(item => item.question).at(-1)?.question ?? null;
  const body = input.raw_text ?? lastCheck?.raw_text;
  const badge = question ? { text: "보완 1건", tone: "amber" } : first
    ? { text: assessment[first.semantic_assessment ?? first.assessment], tone: (first.semantic_assessment ?? first.assessment) === "CLEAR" ? "green" : "amber" }
    : { text: "판정 미기록", tone: "gray" };
  return <details className="ops-card ops-person" open={index < 2}>
    <summary><span className="ops-person-no">{index + 1}</span><span className="ops-person-heading"><strong>{input.display_name}</strong>
      <small>{input.alias} · {stamp(input.created_at ?? lastCheck?.created_at ?? null, zone)}</small></span>
      <Pill {...badge} /><ChevronDown className="ops-chevron" size={15} aria-hidden="true" /></summary>
    <div className="ops-person-body"><div className="ops-field-label">{input.revision === null ? "최근 검사 입력 · 미접수" : "분석 입력 원문"}</div>
      <p className="ops-original">{body ?? (input.revision === null ? "아직 입력하지 않았어요." : "자연어 원문이 없는 입력이에요.")}</p>
      <Verdict value={first} label="첫 기록의 Jev 판정" />
      {question && <Question data={question} zone={zone} />}
      {question && input.checks.length > 1 && <Verdict value={last} label="보완 후 기록된 판정" />}
      {input.legacy_questions.map((item, n) => <Question key={n} data={item} zone={zone} />)}
      {input.interpretation === "UNRESOLVED" && <p className="ops-note-warning">입력에 미해결 조건이 기록되어 있어요.</p>}
      {(input.reference_at || input.unresolved_reason) && <details className="ops-records"><summary>입력 기준·미해결 사유</summary>
        <p>해석 기준 시각: {stamp(input.reference_at, zone)}</p>{input.unresolved_reason && <p>미해결 사유: {input.unresolved_reason}</p>}</details>}
      <StoredConditions input={input} />
      {input.checks.length > 0 && <details className="ops-records"><summary>사전검사 기록 {input.checks.length}건</summary>
        {input.checks.map((check, n) => <div className="ops-check-record" key={n}>
          <strong>{n + 1}. {stamp(check.created_at, zone)}</strong><p className="ops-muted">현재 검사 상태: {check.current_status} · 당시 Jev 판정과 별개예요.</p>
          <p className="ops-original">{check.raw_text}</p>
          {check.attempts.map(attempt => <div key={attempt.generation}><Verdict value={attempt.classification} label={`시도 ${attempt.generation}`} />
            <p className="ops-source-note">{attempt.classification ? `${attempt.classification.provider} · ${attempt.classification.model}` : "첫 분류의 세부 결과는 미기록이에요."}
              {attempt.failure_code ? ` · 종료 분류: ${attempt.failure_code}` : ""}</p></div>)}
          {check.attempts.length === 0 && <p className="ops-muted">저장된 시도 기록이 없어요.</p>}
          {check.attempts_truncated && <p className="ops-muted">이 검사에서 최근 8개 시도만 표시해요.</p>}
        </div>)}
      </details>}
      {input.checks_truncated && <p className="ops-detail-note">추가 이력이 생략되었거나 이력 연결 확인이 필요해요.</p>}
    </div>
  </details>;
}
function StoredConditions({ input }: { input: OperationInput }) {
  const stored = input.stored_interpretation;
  if (!stored) return <p className="ops-interpretation"><Clock3 size={14} aria-hidden="true" />개별 조건의 저장 해석은 미기록이에요.</p>;
  if (stored.coverage !== "STORED_DECLARATION") return <p className="ops-detail-note">이전 저장 형식의 개별 조건은 이 화면에서 지원하지 않아요.</p>;
  const effects: Record<string, string> = { AVAILABLE: "가능", UNAVAILABLE: "불가", PREFERRED: "선호", PREFERENCE: "선호" };
  return <details className="ops-records"><summary>저장된 조건 해석 {stored.conditions.length}건</summary>
    <p className="ops-source-note">개별 조건이며 최종 교집합이나 전체 원문 반영 여부와는 구분해요.</p>
    {stored.conditions.map((condition, n) => <div className="ops-condition" key={n}><Pill text={effects[condition.effect] ?? condition.effect} tone={condition.effect === "UNAVAILABLE" ? "red" : "green"} />
      <span>{condition.start && condition.end ? `${condition.start.replace("T", " ")} — ${condition.end.replace("T", " ")}` : condition.dimension === "PLACE" ? "장소 조건" : "구체적 시간 미정"}</span></div>)}
    {stored.problems.length > 0 && <p className="ops-note-warning">보류·검증 사유: {stored.problems.join(", ")}</p>}
    {stored.truncated && <p className="ops-detail-note">추가 조건 일부가 생략되었어요.</p>}
  </details>;
}
const eventNames: Record<string, string> = {
  INPUTS_FROZEN: "분석 입력 고정", ANALYSIS_CREATED: "분석 실행 생성",
  OUTBOX_OCCURRED: "처리 요청 저장", OUTBOX_PUBLISHED: "처리 요청 전달",
  OUTBOX_PROCESSED: "처리 요청 종결 기록", OUTBOX_DEAD_LETTERED: "처리 요청 자동 복구 중단",
  ROUTE_SELECTED: "분석 경로 고정", INTERPRETATION_PREPARED: "구조화 입력 준비",
  INTERPRETATION_STORED: "구조화 결과 저장", WORKER_FAILURE: "작업 처리 실패",
  BATCH_WORKER_FAILURE: "배치 단위 실패 · 분석 연결 미기록",
};
const failures: Record<string, string> = {
  TIMEOUT: "시간 초과", SERVER: "공급자 일시 오류", INVALID_RESPONSE: "응답 형식 오류", NETWORK: "연결 실패",
  RATE_LIMIT: "요청 한도", BILLING: "결제 설정", QUOTA: "사용 한도", AUTHENTICATION: "공급자 인증", PERMISSION: "공급자 권한",
};
export function AnalysisTimeline({ data, zone }: { data: OperationDiagnostics; zone: string }) {
  const retries = data.invocations.flatMap(item => item.attempts).filter(item => item.role === "RETRY").length;
  const fallback = data.invocations.some(item => item.attempts.some(attempt => attempt.role === "FALLBACK"));
  const steps = [
    ...data.timeline.map((event, index) => ({ kind: "event" as const, at: event.at, event, index })),
    ...data.invocations.map((execution, index) => ({ kind: "execution" as const, at: execution.invocation.started_at, execution, index })),
  ].sort((left, right) => (left.at ? Date.parse(left.at) : Infinity) - (right.at ? Date.parse(right.at) : Infinity));
  return <aside className="ops-side-column" aria-label="전체 분석 과정"><section className="ops-card ops-timeline-card">
    <div className="ops-timeline-head"><h2>전체 분석 과정</h2><Pill text={data.scope === "CURRENT_COLLECTION" ? "현재 입력" : "저장 기록"} /></div>
    <ol className="ops-timeline">
      {steps.map(step => step.kind === "event" ? (() => { const { event } = step; return <li className="ops-step" key={`event-${step.index}`}><span className="ops-step-dot"><Check size={10} aria-hidden="true" /></span>
        <div className="ops-step-title">{eventNames[event.kind] ?? "기록된 처리 단계"}<span className="ops-step-time">{event.at ? stamp(event.at, zone, true) : "시각 미기록"}</span></div>
        {event.status !== "RECORDED" && <p className="ops-step-text">{event.status}</p>}</li>; })() : (() => { const { execution } = step; return <li className="ops-step" key={execution.invocation.id}><span className="ops-step-dot"><Check size={10} aria-hidden="true" /></span>
        <div className="ops-step-title">전체 AI 분석 {data.invocations.length > 1 ? step.index + 1 : ""}<span className="ops-step-time">{execution.invocation.recorded_elapsed_millis === null ? "종료 시각 미기록" : `${(execution.invocation.recorded_elapsed_millis / 1000).toFixed(1)}초`}</span></div>
        <div className="ops-attempts">{execution.attempts.map(item => <div className="ops-attempt" key={item.id}>
          <div><strong>{item.attempt_number}차 · {item.provider === "GEMINI" ? "Gemini" : "OpenAI"}</strong>
            <small>{item.role === "FALLBACK" ? "대체 모델" : item.role === "RETRY" ? "재시도" : "첫 시도"} · {item.recorded_elapsed_millis === null ? "시간 미기록" : `${(item.recorded_elapsed_millis / 1000).toFixed(1)}초`}</small></div>
          <span className={`ops-attempt-status ${item.failure_kind ? "" : "ops-success"}`}>{item.failure_kind ? failures[item.failure_kind] ?? "실패 기록" : item.id === execution.invocation.winner_attempt_id ? "응답 채택" : item.finished_at ? "종결 기록" : "실행 중"}</span>
        </div>)}</div>
        <details className="ops-records"><summary>자세한 실행·사용량 기록</summary><ExecutionDetail data={execution} /></details>
      </li>; })())}
      {data.timeline.length === 0 && data.invocations.length === 0 && <li className="ops-step"><p className="ops-step-text">{data.scope === "CURRENT_COLLECTION" ? "분석 이력을 선택하면 당시 처리 과정을 볼 수 있어요." : "연결된 처리 기록이 없어요. 실행하지 않았다는 뜻은 아니에요."}</p></li>}
    </ol><div className="ops-timeline-bottom"><span>재시도 <strong>{retries}회 기록</strong></span><span>폴백 <strong>{fallback ? "사용 기록" : "사용 기록 없음"}</strong></span></div>
  </section><p className="ops-detail-note">시도 승인은 실제 HTTP 전송·공급자 수신과 구분해요. 기록이 없는 시각·판정은 추정하지 않아요.</p>
    {(data.timeline_truncated || data.invocations_truncated) && <p className="ops-detail-note">일부 추가 처리 기록은 생략되어 있어요.</p>}</aside>;
}
export function StoredResults({ data, zone }: { data: OperationDiagnostics; zone: string }) {
  const people = new Map(data.inputs.map(item => [item.alias, item.display_name]));
  const groups = new Map<string, { result: OperationDiagnostics["results"][number]; modes: Set<string> }>();
  for (const result of data.results) {
    const key = JSON.stringify([result.start_at, result.end_at, result.place_name, result.place_unverified, [...result.available_aliases].sort()]);
    const previous = groups.get(key); if (previous) previous.modes.add(result.meeting_mode);
    else groups.set(key, { result, modes: new Set([result.meeting_mode]) });
  }
  return <section className="ops-card ops-result-card"><div className="ops-card-head"><h2>최종 결과</h2>{groups.size > 0 && <Pill text={`후보 ${groups.size}개`} tone="green" />}</div>
    {groups.size > 0 ? <div className="ops-result-body"><div className="ops-result-top"><span className="ops-result-icon"><Check size={18} aria-hidden="true" /></span>
      <div><strong>선택한 분석의 추천 결과예요</strong><small>저장된 후보와 포함된 참여자를 표시해요.</small></div></div>
      {[...groups.values()].map(({ result, modes }, n) => <div className="ops-time-option" key={n}><strong>{stamp(result.start_at, zone)} — {stamp(result.end_at, zone)}</strong>
        <span>{modes.size > 1 ? modeLabel.EITHER : modeLabel[result.meeting_mode]}{result.place_name ? ` · ${result.place_name}` : ""}</span>
        {result.place_unverified && <Pill text="장소 조건 확인 필요" tone="amber" />}
        <div className="ops-people-statuses">{result.available_aliases.map(alias => <span key={alias} title={alias}>{people.get(alias) ?? alias} · 후보 포함</span>)}</div></div>)}
      <p className="ops-result-footnote">참여 가능 여부의 추가 확인은 각 입력·보류 조건 기록과 함께 확인해요.</p></div>
      : <p className="ops-empty">{data.scope === "CURRENT_COLLECTION" ? "분석 이력을 선택하면 그때의 결과를 볼 수 있어요." : data.analysis?.status === "COMPLETED" ? "저장된 추천 후보가 없어요. 입력과 해석 기록을 확인해 주세요." : "아직 이 분석의 추천 결과가 없어요."}</p>}
    {data.results_truncated && <p className="ops-detail-note">일부 추가 추천이 생략되었어요.</p>}
  </section>;
}
