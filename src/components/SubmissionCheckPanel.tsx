import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { AnalysisLoading } from "./AnalysisLoading";
import { api, ApiError, errorMessage } from "../api/client";
import type { Room } from "../api/types";
import type { StartSubmissionCheckBody, SubmissionCheckCommand, SubmissionCheckSnapshot } from "../api/precheck";
import { viewerContext } from "../api/recovery";
import { usePrivateDraft } from "../auth/usePrivateDraft";
import { getSessionVersion } from "../auth/session";
import { submissionText } from "../utils/submission";
import { submissionExample, TIME_INPUT_GUIDE } from "../utils/submissionGuidance";
import { RoomCloseConfirmation } from "./RoomCloseConfirmation";

type DraftBinding = { kind: "ORIGINAL" } | { kind: "ANSWER"; questionId: string; checkId: string; revision: number };
type ParkedDraft = { text: string; binding: DraftBinding; baseRevision: number };
const bindingKey = (binding: DraftBinding) => binding.kind === "ORIGINAL" ? "ORIGINAL" : `${binding.kind}:${binding.checkId}:${binding.questionId}:${binding.revision}`;
type Operation = ({ kind: "start"; body: StartSubmissionCheckBody } | { kind: "answer" | "retry" | "cancel"; id: string; body: SubmissionCheckCommand }) & { draftAtDispatch?: string; draftBindingAtDispatch?: string };
type Props = { room: Room; onRoomChanged: (room: Room) => void; onAccessDenied: (error: ApiError) => void };
const running = new Set(["QUEUED", "CHECKING"]);
const messages: Record<string, string> = {
  QUEUED: "원문이 저장됐어요. 모호한 부분을 확인 중이에요.",
  CHECKING: "원문이 저장됐어요. 모호한 부분을 확인 중이에요.",
  NEEDS_CHOICE: "원문이 저장됐어요. 결과에 영향을 줄 수 있는 이 부분만 확인해 주세요.",
  NEEDS_EDIT: "원문은 저장됐지만 확인을 완료하지 못했어요. 조건을 직접 수정해 주세요.",
  FAILED: "원문은 저장됐지만 확인에 실패했어요.",
  FAILED_QUEUE: "원문은 저장됐지만 확인 요청을 처리하지 못했어요.",
  TIMED_OUT: "원문은 저장됐지만 확인 시간이 초과됐어요.",
  LIMIT_REACHED: "원문은 저장됐지만 확인 횟수 한도에 도달했어요. 제출 완료로 반영되지 않았어요.",
  CANCELLED: "확인을 취소했어요. 원문은 보존되며 새 제출 완료로 반영하지 않아요.",
  SUPERSEDED: "새 입력으로 대체된 확인이에요. 현재 상태를 다시 확인해 주세요.",
  UNRESOLVED: "이미 보완 질문을 한 번 제공해 추가 질문은 없어요. 이 수정본은 접수되지 않았으며, 마감 시 이전 접수본이 있으면 유지해요.",
  RECEIVED: "접수 완료 · 최종 분석에서 해석해요. 확인되지 않은 부분은 그대로 보존돼요.",
  CLEAR: "확인 결과를 저장하는 중이에요. 제출 완료 여부를 다시 확인해 주세요.",
  CLOSED_BEFORE_COMPLETION: "모임이 마감되어 이 입력의 확인은 이번 결과에 반영되지 않았어요.",
};

// Candidate, accepted, check version and room version are independent clocks.
function latestSnapshot(previous: SubmissionCheckSnapshot | undefined, incoming: SubmissionCheckSnapshot): SubmissionCheckSnapshot {
  if (!previous) return incoming;
  const oldRevision = previous.candidate?.revision ?? 0;
  const newRevision = incoming.candidate?.revision ?? 0;
  const oldCheck = previous.check; const newCheck = incoming.check;
  if (newRevision < oldRevision || (newRevision === oldRevision && oldCheck?.id === newCheck?.id && oldCheck && newCheck && newCheck.version < oldCheck.version)) return { ...previous, room: incoming.room.state_version > previous.room.state_version ? incoming.room : previous.room };
  return { ...incoming, room: previous.room.state_version > incoming.room.state_version ? previous.room : incoming.room };
}

export default function SubmissionCheckPanel({ room, onRoomChanged, onAccessDenied }: Props) {
  const client = useQueryClient();
  const authVersion = getSessionVersion();
  const owner = `${room.invite_code}:${viewerContext(room)}:${authVersion}`;
  const key = ["submission-check", room.invite_code, viewerContext(room), authVersion] as const;
  const live = useRef(true);
  const generation = useRef(0);
  const latestOwner = useRef(owner); latestOwner.current = owner;
  const latestRoom = useRef(room); latestRoom.current = room;
  const [draft, setDraft] = useState("");
  const [draftBinding, setDraftBinding] = useState<DraftBinding>({ kind: "ORIGINAL" });
  const [parkedDraft, setParkedDraft] = useState<ParkedDraft | null>(null);
  const latestParkedDraft = useRef(parkedDraft); latestParkedDraft.current = parkedDraft;
  const latestDraftBinding = useRef(draftBinding); latestDraftBinding.current = draftBinding;
  const latestDraft = useRef(draft); latestDraft.current = draft;
  const draftEdited = useRef(false);
  const draftBaseRevision = useRef(0);
  const [editing, setEditing] = useState(false);
  const [direct, setDirect] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const busy = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState<Operation | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [closeError, setCloseError] = useState<unknown>(null);
  const active = () => live.current && latestOwner.current === owner && getSessionVersion() === authVersion;
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const started = generation.current;
      const incoming = await api.getSubmissionCheck(room.invite_code, signal);
      if (!active() || signal.aborted || started !== generation.current) throw new DOMException("Obsolete private read", "AbortError");
      return latestSnapshot(client.getQueryData<SubmissionCheckSnapshot>(key), incoming);
    },
    enabled: !denied,
    retry: false,
    refetchInterval: query => query.state.data?.room.collection_status === "COLLECTING" && running.has(query.state.data?.check?.status ?? "") && room.collection_status === "COLLECTING" ? 2_000 : false,
  });
  const v2 = room.submission_protocol === "PRE_SUBMIT_V2";
  const current = query.data;
  const check = current?.check;
  const question = check?.status === "NEEDS_CHOICE" ? check.question : null;
  const closed = room.collection_status === "CLOSED" || current?.room.collection_status === "CLOSED";
  const legacyCorrectionAccepted = current?.accepted?.confirmation_source === "LEGACY_CORRECTION";
  const unverifiedCorrectionAccepted = current?.accepted?.confirmation_source === "UNVERIFIED_CORRECTION";
  const correctionAccepted = legacyCorrectionAccepted || unverifiedCorrectionAccepted;
  const closureVerified = current?.room.collection_status === "CLOSED";
  const acceptedComplete = !!current?.submission_complete && !!current.accepted && (check?.status === "CLEAR" || (v2 && check?.status === "RECEIVED"));
  const unresolvedReceived = acceptedComplete && check?.status === "RECEIVED";
  const complete = acceptedComplete && !editing && !draftEdited.current && !parkedDraft;
  const input = submissionText(draft);
  const candidate = current?.candidate;
  const supplement = correctionAccepted ? current?.accepted?.evidence?.supplement : candidate?.evidence?.supplement ?? current?.accepted?.evidence?.supplement;
  const answerDraft = v2 && draftBinding.kind === "ANSWER";
  const answerBindingActive = draftBinding.kind === "ANSWER" && draftBinding.questionId === question?.id && draftBinding.checkId === check?.id && draftBinding.revision === candidate?.revision;
  const answerMaximum = Math.max(0, 500 - Array.from(candidate?.raw_text ?? "").length);
  const maximum = answerDraft ? answerMaximum : 500;
  const validInput = input.valid && input.length <= maximum;
  const commandAllowed = !closed && !!current && !pending && !query.isError;
  const showEditor = !closed && !!current && (!candidate || editing || direct || draftEdited.current) && (!question || direct || draftEdited.current || (v2 && !answerDraft && editing)) && (!answerDraft || (direct && answerBindingActive));
  useEffect(() => {
    live.current = true;
    const activeGeneration = generation;
    return () => {
      live.current = false; activeGeneration.current++;
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
    };
    // The parent keys this component by room, viewer and account epoch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftEdited.current) setDraft(candidate?.raw_text ?? "");
  }, [candidate?.revision, candidate?.raw_text]);
  useEffect(() => { setSelected(null); setDirect(false); }, [check?.id, question?.id]);
  useEffect(() => {
    if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) {
      if ([403, 404].includes(query.error.status)) privateDraft.discard();
      generation.current++; setDenied(true); setDraft(""); setSelected(null); setUncertain(null);
      client.removeQueries({ queryKey: key, exact: true }); onAccessDenied(query.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  useEffect(() => {
    if (current && (room.state_version ?? 0) > current.room.state_version) void query.refetch();
    // A room state transition prompts a private read; its result cannot prompt a read loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.state_version, room.collection_status]);

  const privateDraft = usePrivateDraft({ room, editorKind: answerDraft ? "PRECHECK_ANSWER" : "PRECHECK", questionId: draftBinding.kind === "ANSWER" ? draftBinding.questionId : undefined, revision: candidate?.revision ?? 0, fresh: query.isSuccess && query.isFetchedAfterMount && !query.isFetching, onRecovered: (raw, revision) => { draftBaseRevision.current = revision; draftEdited.current = true; setDraft(raw); setEditing(true); if (answerDraft && answerBindingActive) setDirect(true); } });
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if ((draftEdited.current && latestDraft.current.length > 0) || latestParkedDraft.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload);
  }, []);
  async function execute(operation: Operation) {
    if (!active() || busy.current || closed) return;
    busy.current = true; setPending(true); setFailure(null); setUncertain(null); setRecovered(false);
    generation.current++;
    void client.cancelQueries({ queryKey: key, exact: true });
    if (!active()) return;
    try {
      const result = operation.kind === "start" ? await api.startSubmissionCheck(room.invite_code, operation.body)
        : operation.kind === "answer" ? await api.answerSubmissionCheck(room.invite_code, operation.id, operation.body)
          : operation.kind === "retry" ? await api.retrySubmissionCheck(room.invite_code, operation.id, operation.body)
            : await api.cancelSubmissionCheck(room.invite_code, operation.id, operation.body);
      if (!active()) return;
      client.setQueryData<SubmissionCheckSnapshot>(key, previous => latestSnapshot(previous, result));
      const submitted = operation.kind === "start" ? operation.body.raw_text : operation.kind === "answer" ? operation.body.direct_text : undefined;
      const hasNewDraft = submitted === undefined ? draftEdited.current : operation.draftAtDispatch === undefined || latestDraft.current !== operation.draftAtDispatch || (v2 && operation.draftBindingAtDispatch !== bindingKey(latestDraftBinding.current));
      if (!hasNewDraft && (operation.kind === "start" || operation.kind === "answer")) {
        privateDraft.discard(); draftEdited.current = false; setDraft(result.candidate?.raw_text ?? latestDraft.current); setDirect(false); setSelected(null);
        if (v2) setDraftBinding({ kind: "ORIGINAL" });
      }
      setEditing(hasNewDraft);
      if (latestRoom.current.collection_status === "CLOSED" && result.room.collection_status !== "CLOSED") void query.refetch();
      void client.invalidateQueries({ queryKey: ["room", room.invite_code] });
    } catch (error) {
      if (!active()) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        if ([403, 404].includes(error.status)) privateDraft.discard();
        setDenied(true); setDraft(""); setSelected(null); client.removeQueries({ queryKey: key, exact: true }); onAccessDenied(error);
      } else {
        setFailure(error);
        if (!(error instanceof ApiError) || error.status >= 500 || error.status === 408) setUncertain(operation);
        if (error instanceof ApiError && error.status === 409) { void query.refetch(); void client.invalidateQueries({ queryKey: ["room", room.invite_code] }); }
      }
    } finally { if (active()) { busy.current = false; setPending(false); } }
  }
  async function recover() {
    const result = await query.refetch();
    if (!active() || result.isError) return;
    setRecovered(true);
    if (uncertain && result.data?.operation_outcome?.request_id === uncertain.body.request_id) { setUncertain(null); setFailure(null); }
  }
  function command(kind: "answer" | "retry" | "cancel", extra: Partial<SubmissionCheckCommand> = {}) {
    if (!commandAllowed || !check || !candidate) return;
    if (v2 && kind === "answer" && extra.choice_id && Array.from(question?.options.find(option => option.id === extra.choice_id)?.proposed_text ?? "").length > answerMaximum) return;
    void execute({ kind, id: check.id, ...(extra.direct_text === undefined ? {} : { draftAtDispatch: latestDraft.current, draftBindingAtDispatch: bindingKey(latestDraftBinding.current) }), body: { request_id: crypto.randomUUID(), expected_revision: candidate.revision, expected_check_version: check.version, ...extra } });
  }
  function submit() {
    if (!commandAllowed || !validInput || uncertain || busy.current) return;
    if (answerDraft && (!answerBindingActive || !direct)) return;
    if ((v2 ? answerDraft : direct) && question) command("answer", { question_id: question.id, direct_text: input.text });
    else void execute({ kind: "start", draftAtDispatch: latestDraft.current, draftBindingAtDispatch: bindingKey(latestDraftBinding.current), body: { request_id: crypto.randomUUID(), expected_revision: candidate?.revision ?? 0, raw_text: input.text } });
  }
  function switchDraft(binding: DraftBinding, defaultText: string, baseRevision: number) {
    const matching = parkedDraft && bindingKey(parkedDraft.binding) === bindingKey(binding) ? parkedDraft : null;
    if (bindingKey(draftBinding) === bindingKey(binding)) { setEditing(true); return true; }
    if (parkedDraft && !matching && draftEdited.current && draft.length > 0) {
      setFailure(new ApiError(409, { detail: "보관한 초안을 버리거나 다시 편집한 뒤 입력 방식을 바꿔 주세요." }));
      return false;
    }
    setParkedDraft(draftEdited.current && draft.length > 0 ? { text: draft, binding: draftBinding, baseRevision: draftBaseRevision.current } : matching ? null : parkedDraft);
    setDraftBinding(binding); setDraft(matching?.text ?? defaultText);
    draftBaseRevision.current = matching?.baseRevision ?? baseRevision;
    draftEdited.current = !!matching || binding.kind === "ANSWER";
    setEditing(true);
    return true;
  }
  function openDirectAnswer() {
    if (!question || !check || !candidate) return;
    if (v2) { if (!switchDraft({ kind: "ANSWER", questionId: question.id, checkId: check.id, revision: candidate.revision }, "", candidate.revision)) return; }
    else { if (!draftEdited.current) { draftBaseRevision.current = candidate.revision; setDraft(candidate.raw_text); } draftEdited.current = true; }
    setDirect(true); setSelected(null);
  }
  function discardAnswerDraft() {
    privateDraft.discard(); draftEdited.current = false; setDraft(candidate?.raw_text ?? ""); setDraftBinding({ kind: "ORIGINAL" }); setEditing(false); setDirect(false);
  }
  function openOriginalEditor() {
    if (v2) switchDraft({ kind: "ORIGINAL" }, candidate?.raw_text ?? "", candidate?.revision ?? 0);
    else { setEditing(true); setDraft(candidate?.raw_text ?? ""); draftEdited.current = false; }
    setDirect(false);
  }
  async function closeRoom() {
    if (busy.current || !active() || latestRoom.current.viewer.role !== "HOST" || latestRoom.current.collection_status === "CLOSED") return;
    busy.current = true; setPending(true); setCloseError(null);
    try { const refreshed = await api.closeRoom(room.invite_code, true); if (active()) { onRoomChanged(refreshed); void query.refetch(); } }
    catch (error) {
      if (!active()) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error);
      else setCloseError(error);
    } finally { if (active()) { busy.current = false; setPending(false); } }
  }
  if (denied) return null;
  // Presentation only: keep polling, ownership and in-memory drafts mounted.
  // A failed read/command must expose recovery instead of hiding it behind motion.
  if (!closed && running.has(check?.status ?? "") && !query.isError && failure == null && !uncertain && closeError == null) {
    return <AnalysisLoading title="모호한 부분을 확인 중이에요." />;
  }
  return <details className={`submission-disclosure ${closed ? "is-closed" : "is-collecting"}`} open={closed ? undefined : true}><summary>내 저장 입력 확인</summary><div className="submission-layout submission-layout--single"><section className={`glass-card submission-card precheck-card ${complete ? "submission-complete" : ""}`} aria-label="제출 전 조건 확인">
    <div className="section-heading"><h2>{closed ? "마감된 내 입력 확인" : candidate ? showEditor ? "조건 수정" : "저장된 조건" : "가능한 조건을 알려주세요"}</h2>
      {complete && !closed && <p role="status"><CheckCircle2 size={16} /> {unresolvedReceived ? messages.RECEIVED : "제출 완료 · 다른 참여자를 기다려 주세요."}</p>}
      {!closed && !complete && check && !editing && !draftEdited.current && <p role="status" aria-live="polite" aria-atomic="true">{messages[check.status] ?? "현재 확인 상태를 다시 조회해 주세요."}</p>}
    </div>
    {query.isPending && <p role="status">내 입력 확인 상태를 불러오는 중…</p>}
    {query.isError && <div className="alert error" role="alert">확인 상태를 불러오지 못했어요. {errorMessage(query.error)}<button className="button secondary" onClick={() => query.refetch()}>현재 상태 확인</button></div>}
    {candidate && !(closed && correctionAccepted) && !(acceptedComplete && (editing || draftEdited.current)) && <div className="submitted-condition"><h3>저장된 원문 #{candidate.revision}</h3><p className="submitted-text">{candidate.raw_text}</p></div>}
    {supplement && <div className="submitted-condition"><h3>제출한 보완 답변</h3><p>확인한 부분: {supplement.source_excerpt}</p><p className="submitted-text">{supplement.answer_text}</p></div>}
    {current?.accepted && (!complete || closed) && (!closed || closureVerified) && <div className="submitted-condition"><h3>{legacyCorrectionAccepted ? "조건 수정에서 저장한 입력" : unverifiedCorrectionAccepted ? "해석 미확정 수정 접수본" : v2 ? "마지막 접수본" : "마지막 확인 완료본"}</h3><p className="submitted-text">{current.accepted.raw_text}</p><p>{closed ? current.applied_to_result ? legacyCorrectionAccepted ? "수정 라운드에서 저장한 입력을 이번 결과에 사용해요." : v2 ? "마지막 접수본을 최종 분석에 전달했어요. 실제 해석·반영 여부는 결과를 확인해 주세요." : "마지막 확인 완료본을 이번 결과에 사용해요." : "이 저장본은 이번 결과에 사용되지 않았어요." : v2 ? "수정 확인 중에는 이전 접수본을 유지해요." : "수정 확인 중에는 이전 확인 완료본을 유지해요."}</p></div>}
    {closed && closureVerified && !complete && !correctionAccepted && <p className="alert warning" role="status">{current?.accepted ? "이번 수정은 확인을 완료하지 못해 이번 결과에 반영되지 않았어요." : "확인을 완료하지 못한 이 입력은 이번 결과에 반영되지 않았어요."}</p>}
    {closed && !closureVerified && <div className="alert warning" role="status"><p>모임 마감은 확인됐어요. 내 입력의 최종 반영 여부는 현재 상태를 다시 확인해 주세요.</p><button className="button secondary" disabled={query.isFetching} onClick={() => query.refetch()}>반영 여부 확인</button></div>}
    {question && !closed && <div className="precheck-question"><h3>{question.text}</h3><p>확인할 부분: {question.source_excerpt}</p><div className="actions">{question.options.map(option => <button key={option.id} className="button secondary" aria-pressed={selected === option.id} disabled={!commandAllowed || (v2 && Array.from(option.proposed_text).length > answerMaximum)} onClick={() => { setSelected(option.id); setDirect(false); }}>{option.text}</button>)}<button className="button secondary" disabled={!commandAllowed} onClick={openDirectAnswer}>{v2 ? "직접 답변" : "직접 수정"}</button>{v2 && <button className="button secondary" disabled={!commandAllowed} onClick={openOriginalEditor}>원문 수정</button>}</div>{v2 && <p className="field-hint">원문과 답변은 합계 500자 이내로 보존해요. 답변에 사용할 수 있는 분량은 {answerMaximum}자예요.</p>}
      {selected && !direct && <div className="choice-preview"><p className="submitted-text">{question.options.find(option => option.id === selected)?.proposed_text}</p><button className="button primary" disabled={!commandAllowed || (v2 && Array.from(question.options.find(option => option.id === selected)?.proposed_text ?? "").length > answerMaximum)} onClick={() => command("answer", { question_id: question.id, choice_id: selected })}>{v2 ? "선택한 답변 제출" : "선택한 내용으로 확인"}</button></div>}
    </div>}
    {v2 && answerDraft && draftEdited.current && !showEditor && <section className="alert warning" aria-label="미저장 보완 답변 보존"><h3>미저장 보완 답변을 따로 보관했어요</h3><p>이 답변은 작성하던 질문에만 연결돼요. 새 원문으로 제출하지 않아요.</p><label className="field"><span>미저장 보완 답변</span><textarea readOnly value={draft} rows={3} /></label><button className="button secondary" onClick={discardAnswerDraft}>미저장 답변 버리기</button></section>}
    {v2 && parkedDraft && <section className="alert warning" aria-label="별도로 보관한 초안"><h3>{parkedDraft.binding.kind === "ORIGINAL" ? "미저장 원문을 따로 보관했어요" : "미저장 보완 답변을 따로 보관했어요"}</h3><p>아래 내용은 자동으로 제출되지 않아요. 이 화면을 떠나면 별도로 보관한 초안은 사라질 수 있어요.</p><label className="field"><span>{parkedDraft.binding.kind === "ORIGINAL" ? "보관한 미저장 원문" : "보관한 미저장 보완 답변"}</span><textarea readOnly value={parkedDraft.text} rows={3} /></label>{!closed && parkedDraft.binding.kind === "ORIGINAL" && <button className="button secondary" onClick={() => { switchDraft({ kind: "ORIGINAL" }, candidate?.raw_text ?? "", candidate?.revision ?? 0); setDirect(false); }}>원문 초안 다시 편집</button>}<button className="button secondary" onClick={() => { privateDraft.discardFor(parkedDraft.binding.kind === "ANSWER" ? "PRECHECK_ANSWER" : "PRECHECK", parkedDraft.binding.kind === "ANSWER" ? parkedDraft.binding.questionId : undefined); setParkedDraft(null); }}>보관한 초안 버리기</button></section>}
    {privateDraft.conflictPanel}
    {draftEdited.current && <p className="alert warning" role="status">새 수정 내용은 아직 저장하지 않았어요. 이 화면에만 보관하며 새 조건으로 반영되지 않았어요.</p>}
    {draftEdited.current && candidate && candidate.revision > draftBaseRevision.current && input.text !== candidate.raw_text && <p className="alert warning" role="status">최신 입력이 갱신됐어요. 다른 탭의 저장 내용과 이 화면의 미저장 입력을 구분해 확인해 주세요. 내 임시 입력은 이 화면에 보존했어요.</p>}
    {showEditor && <><label className="field"><span>{answerDraft ? "보완 답변" : "시간·장소 조건"} <small>필수</small></span><textarea autoFocus={editing || direct} rows={4} value={draft} aria-describedby="precheck-input-hint precheck-count" aria-invalid={input.length > maximum} placeholder={answerDraft ? "질문한 부분에 대한 답변을 입력해 주세요" : submissionExample(room.meeting_mode)} onChange={event => { if (!draftEdited.current) draftBaseRevision.current = candidate?.revision ?? 0; draftEdited.current = true; privateDraft.remember(event.target.value, draftBaseRevision.current); setDraft(event.target.value); }} /><small id="precheck-count" className={input.length > maximum ? "field-error" : "character-count"}>{input.length}/{maximum}</small></label>
      <p id="precheck-input-hint" className="field-hint">{answerDraft ? `원문은 유지하고 질문한 부분의 답변만 보존해요. 답변 후 추가 질문은 없어요. 원문과 답변 합계는 500자 이내이며, 답변은 ${answerMaximum}자까지 입력할 수 있어요.` : `${TIME_INPUT_GUIDE} 앞뒤 공백을 제외하고 1~500자로 입력해 주세요.`}</p><button className="button primary" disabled={!commandAllowed || !validInput || !!uncertain || (answerDraft && !answerBindingActive)} onClick={submit}>{pending ? "확인 요청 중…" : direct ? v2 ? "답변 제출" : "수정한 내용 확인" : candidate ? "수정 내용 확인" : "조건 제출하기"}</button></>}
    {!closed && candidate && !question && !showEditor && <button className="button secondary" disabled={pending} onClick={openOriginalEditor}>내 조건 수정</button>}
    {!closed && check && check.retry_allowed && <button className="button secondary" disabled={!commandAllowed} onClick={() => command("retry")}>다시 확인</button>}
    {!closed && check && !["CLEAR", "RECEIVED", "CANCELLED", "SUPERSEDED", "CLOSED_BEFORE_COMPLETION"].includes(check.status) && <button className="button secondary" disabled={!commandAllowed} onClick={() => command("cancel")}>확인 취소</button>}
    {!closed && check && !["CLEAR", "RECEIVED", "CANCELLED", "SUPERSEDED", "CLOSED_BEFORE_COMPLETION"].includes(check.status) && <p className="field-hint">확인 취소는 이 입력의 확인 작업만 그만둬요. 저장한 원문과 이전 확인 완료본은 유지돼요.</p>}
    {failure != null && <div className="alert error" role="alert"><p>{uncertain ? "요청 결과를 확인하지 못했어요. 현재 상태를 조회한 뒤 같은 요청을 다시 보낼 수 있어요." : errorMessage(failure)}</p><button className="button secondary" disabled={query.isFetching} onClick={() => { void recover(); }}>현재 상태 확인</button>{uncertain && !closed && <button className="button secondary" disabled={pending || query.isFetching || !recovered} onClick={() => { if (uncertain) void execute(uncertain); }}>같은 요청 다시 보내기</button>}</div>}
    {!closed && <details className="submission-help"><summary>저장·제출 안내</summary><p className="field-hint">{v2 ? "보완 질문은 한 번만 제공돼요. 접수된 입력의 해석 미확정 부분은 최종 분석으로 넘겨요. 질문에 답하지 않았거나 검사 중·기술 실패로 접수되지 않은 수정은 마감 시 이전 접수본을 유지해요." : "저장과 제출 완료는 달라요. 마감까지 확인이 끝나지 않은 입력은 이번 결과에 반영되지 않을 수 있어요. 수정본을 검사하다 마감되면 마지막 확인 완료본을 사용해요."}</p></details>}
    {!closed && room.viewer.role === "HOST" && <details className="host-tools-inline"><summary>주최자 도구</summary><RoomCloseConfirmation disabled={pending} pending={pending} unsaved={draftEdited.current} error={closeError != null ? errorMessage(closeError) : undefined} onConfirm={() => { void closeRoom(); }} /></details>}
  </section></div></details>;
}
