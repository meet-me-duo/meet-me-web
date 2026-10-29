import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Sparkles, TriangleAlert, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, errorMessage } from "../api/client";
import type { Submission } from "../api/types";
import { correctionOpen, currentRoom, viewerContext, type RecoveryRoom as Room, type ReopenResponse, type ReanalyzeResponse } from "../api/recovery";
import AnalysisRecoveryPanel from "../components/AnalysisRecoveryPanel";
import ClarificationPanel from "../components/ClarificationPanel";
import SubmissionCheckPanel from "../components/SubmissionCheckPanel";
import { RoomCloseConfirmation } from "../components/RoomCloseConfirmation";
import { RecommendationsPanel, RECOMMENDATION_PROTOCOL } from "../components/RecommendationsPanel";
import { formatRecommendationRange } from "../utils/recommendationTime";
import { CandidateCard } from "../components/CandidateCard";
import { formatDate, formatDateTime } from "../utils/time";
import { submissionText, SUBMISSION_TEXT_LIMIT } from "../utils/submission";
import { submissionExample, TIME_INPUT_GUIDE } from "../utils/submissionGuidance";
import { useAccountSession } from "../auth/useAccount";
import { LoginGate } from "../auth/AccountViews";
import { usePrivateDraft } from "../auth/usePrivateDraft";
import { discardQuarantinedDraftForRoom } from "../auth/draftQuarantine";
import { getSession, getSessionVersion } from "../auth/session";
import GuestAccessPanel from "../components/GuestAccessPanel";
import { ReviewPrompt } from "../features/review/ReviewPrompt";
import { roomLink } from "../utils/roomLink";

const UNAPPLIED_REASON_MESSAGES: Record<string, string> = {
  LEGACY_MANUAL_ONLY_UNSUPPORTED: "기존 시간표 입력은 새 분석에서 지원하지 않아 반영되지 않았어요.",
  UNSUPPORTED_CONDITIONAL_CONSTRAINT: "장소에 따라 시간이 달라지는 등 조건별로 시간과 장소를 연결한 입력은 현재 처리할 수 없어요. 이 입력은 후보 계산에 반영되지 않았어요.",
  AMBIGUOUS_TIME_CONSTRAINT: "가능한 시간이 명확하지 않아 이 입력을 후보 계산에 반영하지 못했어요. 날짜와 시작·종료 시간을 구체적으로 적어 주세요.",
};

export default function RoomPage() {
  const { inviteCode = "" } = useParams();
  const accountSession = useAccountSession();
  const authVersion = getSessionVersion();
  useEffect(() => () => {
    // Only the authentication epoch transition may retain this room's draft.
    if (getSessionVersion() === authVersion) discardQuarantinedDraftForRoom(inviteCode);
  }, [inviteCode, authVersion]);
  const currentAccess = useRef({ inviteCode, authVersion });
  currentAccess.current = { inviteCode, authVersion };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ inviteCode: string; viewer: string; rawText: string } | null>(null);
  const accessEpoch = useRef(0);
  const [clarificationPendingOwner, setClarificationPendingOwner] = useState<string | null>(null);
  const updateDraft = useCallback((room: Room, rawText: string | null) => setDraft(previous => rawText === null ? null : previous?.inviteCode === room.invite_code && previous.viewer === viewerContext(room) && previous.rawText === rawText ? previous : { inviteCode: room.invite_code, viewer: viewerContext(room), rawText }), []);
  useEffect(() => { setDraft(null); }, [inviteCode]);
  const [accessFailure, setAccessFailure] = useState<{ inviteCode: string; error: Error } | null>(null);
  const deniedRoom = useRef<string | null>(null);
  const denyAccess = useCallback((error: ApiError) => { if (getSessionVersion() === authVersion) discardQuarantinedDraftForRoom(inviteCode); accessEpoch.current++; setDraft(null); deniedRoom.current = inviteCode; setAccessFailure({ inviteCode, error }); }, [inviteCode, authVersion]);
  const roomQuery = useQuery({
    queryKey: ["room", inviteCode],
    queryFn: async ({ signal }) => {
      const readEpoch = accessEpoch.current;
      const incoming = await api.getRoom(inviteCode, signal);
      const previous = queryClient.getQueryData<Room>(["room", inviteCode]);
      if (signal.aborted || readEpoch !== accessEpoch.current) return previous ?? incoming;
      if (getSession() && getSessionVersion() === authVersion && (!incoming.viewer.joined || (previous && viewerContext(previous) !== viewerContext(incoming)))) discardQuarantinedDraftForRoom(inviteCode);
      if (previous && viewerContext(previous) !== viewerContext(incoming)) {
        accessEpoch.current++;
        const contextEpoch = accessEpoch.current;
        setDraft(null);
        const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission-check", "clarifications", "submission", "candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
        await queryClient.cancelQueries(filters);
        if (signal.aborted || contextEpoch !== accessEpoch.current) return queryClient.getQueryData<Room>(["room", inviteCode]) ?? incoming;
        queryClient.removeQueries(filters);
      }
      return currentRoom(previous, incoming);
    },
    enabled: /^[A-Za-z0-9_-]{22}$/.test(inviteCode) && accessFailure?.inviteCode !== inviteCode,
    refetchInterval: (query) => {
      const room = query.state.data;
      if (room?.public_status === "ANALYZING") return 2_000;
      if (room?.public_status === "COLLECTING" || (room?.viewer.joined && ["READY", "READY_WITH_WARNINGS"].includes(room.public_status))) return 5_000;
      return false;
    },
  });
  const epoch = accessEpoch.current;
  const setRoom = (room: Room) => {
    if (deniedRoom.current === inviteCode || epoch !== accessEpoch.current) return;
    const previous = queryClient.getQueryData<Room>(["room", inviteCode]);
    if (getSession() && getSessionVersion() === authVersion && (!room.viewer.joined || (previous && viewerContext(previous) !== viewerContext(room)))) discardQuarantinedDraftForRoom(inviteCode);
    if (previous && viewerContext(previous) !== viewerContext(room)) {
      accessEpoch.current++;
      setDraft(null);
      const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission-check", "clarifications", "submission", "candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
      void queryClient.cancelQueries(filters);
      queryClient.removeQueries(filters);
    }
    queryClient.setQueryData<Room>(["room", inviteCode], currentRoom(previous, room));
  };
  const privateAccessDenied = (error: ApiError) => { if (epoch === accessEpoch.current) denyAccess(error); };
  const restoreVerifiedGuest = async () => {
    const isCurrent = () => mounted.current && currentAccess.current.inviteCode === inviteCode && currentAccess.current.authVersion === authVersion && getSessionVersion() === authVersion;
    if (!isCurrent()) return;
    accessEpoch.current++;
    const verifiedEpoch = accessEpoch.current;
    setDraft(null);
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["room", "submission-check", "clarifications", "submission", "candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
    await queryClient.cancelQueries(filters);
    if (!isCurrent() || verifiedEpoch !== accessEpoch.current) return;
    queryClient.removeQueries({ predicate: query => filters.predicate(query) && query.queryKey[0] !== "room" });
    const refreshed = await api.getRoom(inviteCode);
    if (!isCurrent() || verifiedEpoch !== accessEpoch.current) return;
    deniedRoom.current = null;
    queryClient.setQueryData(["room", inviteCode], refreshed);
    setAccessFailure(null);
  };
  const restoreAccess = useMutation({
    mutationKey: ["room", inviteCode],
    mutationFn: (code: string) => api.getRoom(code),
    onSuccess: (refreshed, code) => {
      if (code !== inviteCode) return;
      accessEpoch.current++;
      deniedRoom.current = null;
      queryClient.setQueryData(["room", code], refreshed);
      setAccessFailure(null);
    },
    onError: (error, code) => {
      if (code === inviteCode) setAccessFailure({ inviteCode: code, error: error instanceof Error ? error : new Error("모임을 다시 불러오지 못했어요.") });
    },
  });

  useEffect(() => {
    if (roomQuery.data?.viewer.joined !== false) return;
    const purgeEpoch = accessEpoch.current;
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission-check", "clarifications", "submission", "candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
    void queryClient.cancelQueries(filters).then(() => { if (purgeEpoch === accessEpoch.current) queryClient.removeQueries(filters); });
    for (const mutation of queryClient.getMutationCache().getAll()) {
      if (mutation.options.mutationKey?.[1] === inviteCode) queryClient.getMutationCache().remove(mutation);
    }
  }, [roomQuery.data?.viewer.joined, inviteCode, queryClient]);
  useEffect(() => {
    if (roomQuery.error instanceof ApiError && [401, 403, 404].includes(roomQuery.error.status)) denyAccess(roomQuery.error);
  }, [roomQuery.error, denyAccess]);
  useEffect(() => {
    if (accessFailure?.inviteCode !== inviteCode) return;
    const purgeEpoch = accessEpoch.current;
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["room", "submission-check", "clarifications", "submission", "candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
    void queryClient.cancelQueries(filters).then(() => { if (purgeEpoch === accessEpoch.current && deniedRoom.current === inviteCode) queryClient.removeQueries(filters); });
    for (const mutation of queryClient.getMutationCache().getAll()) {
      if (mutation.options.mutationKey?.[1] === inviteCode) queryClient.getMutationCache().remove(mutation);
    }
  }, [accessFailure, inviteCode, queryClient]);
  if (accessFailure?.inviteCode === inviteCode) return <StateCard icon={<AlertCircle />} title="모임을 불러오지 못했어요" body={errorMessage(accessFailure.error)} action={<button className="button secondary" disabled={restoreAccess.isPending} onClick={() => restoreAccess.mutate(inviteCode)}>{restoreAccess.isPending ? "불러오는 중…" : "다시 시도"}</button>} />;


  if (!/^[A-Za-z0-9_-]{22}$/.test(inviteCode)) return <StateCard icon={<AlertCircle />} title="초대 링크가 올바르지 않아요" body="받은 링크 전체를 다시 확인해 주세요." />;
  if (roomQuery.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="모임을 불러오는 중이에요" />;
  if (roomQuery.isError && (!roomQuery.data || (roomQuery.error instanceof ApiError && [401, 403, 404].includes(roomQuery.error.status)))) return <StateCard icon={<AlertCircle />} title="모임을 불러오지 못했어요" body={errorMessage(roomQuery.error)} action={<button className="button secondary" onClick={() => roomQuery.refetch()}>다시 시도</button>} />;
  const room = roomQuery.data;
  const ownerKey = `${room.invite_code}:${viewerContext(room)}`;
  const currentDraft = draft?.inviteCode === room.invite_code && draft.viewer === viewerContext(room) ? draft.rawText : null;
  if (room.submission_protocol != null && !["PRE_SUBMIT_V1", "LEGACY"].includes(room.submission_protocol)) return <div className="room-page page-width"><RoomHeader room={room} /><StateCard icon={<RefreshCw />} title="조건 확인 화면 업데이트가 필요해요" body="서버에서 사용하는 조건 제출 버전을 이 화면이 지원하지 않아요. 새로고침해 지원하는 계약을 다시 확인해 주세요." /></div>;
  const showEditor = room.public_status === "COLLECTING" && (!correctionOpen(room) || room.capabilities?.can_edit_own_submission);

  if (!room.viewer.joined) return <div className="form-page page-width narrow">{room.collection_status === "CLOSED" ? <><h1>입력이 마감된 모임이에요</h1><p>{room.purpose}</p></> : <h1>{room.purpose}</h1>}<GuestAccessPanel room={room} roomKey={`${inviteCode}:auth:${authVersion}:access:${epoch}`} onJoined={joined => { if (!mounted.current || deniedRoom.current === inviteCode || epoch !== accessEpoch.current || currentAccess.current.inviteCode !== inviteCode || currentAccess.current.authVersion !== authVersion || getSessionVersion() !== authVersion) return; setRoom(joined); }} onVerified={restoreVerifiedGuest} /></div>;

  if (!accountSession && room.viewer.role === "HOST") return <div className="room-page page-width"><RoomHeader room={room} /><LoginGate returnTo={`/rooms/${inviteCode}`} /><p className="privacy-note">주최자 기능은 로그인 계정으로 만든 모임에서 사용할 수 있어요.</p></div>;

  return (
    <div className="room-page page-width">
      <RoomHeader room={room} />
      {roomQuery.isError && <div className="alert warning room-refresh-warning" role="status"><span>모임 상태를 갱신하지 못했어요. 마지막으로 확인한 상태를 보여드려요.</span><button className="button secondary" disabled={roomQuery.isFetching} onClick={() => roomQuery.refetch()}>진행 상태 다시 확인</button></div>}
      {room.submission_protocol === "PRE_SUBMIT_V1" && !correctionOpen(room) && <SubmissionCheckPanel key={`check:${ownerKey}:auth:${authVersion}`} room={room} onRoomChanged={setRoom} onAccessDenied={privateAccessDenied} />}
      {showEditor && (room.submission_protocol !== "PRE_SUBMIT_V1" || correctionOpen(room)) && <SubmissionPanel key={`submission:${ownerKey}`} room={room} onRoomChanged={setRoom} onAccessDenied={privateAccessDenied} draft={currentDraft} onDraftChanged={updateDraft} clarificationPending={clarificationPendingOwner === ownerKey} />}
      {!showEditor && currentDraft !== null && <section className="glass-card side-card"><h2>서버 반영을 확인하지 않은 임시 입력</h2><p>저장하지 않은 내용은 분석에 포함되지 않아요. 이 화면에만 임시로 보관했어요. 저장 여부는 내 저장된 입력에서 확인해 주세요. 새로고침하거나 다른 모임으로 이동하면 사라져요.</p><label className="field"><span>내 임시 조건</span><textarea readOnly value={currentDraft} rows={4} /></label><button className="button secondary" onClick={() => setDraft(null)}>임시 수정 버리기</button></section>}
      {room.public_status === "COLLECTING" && correctionOpen(room) && !room.capabilities?.can_edit_own_submission && <StateCard icon={<LockKeyhole />} title="조건을 수정하는 중이에요" body="기존에 입력을 제출한 참여자가 자신의 입력을 수정할 수 있어요." />}
      {room.public_status === "ANALYZING" && <StateCard icon={<LoaderCircle className="spin" />} title="모두의 조건을 분석하고 있어요" body="접수된 조건으로 최적의 플랜을 만드는 중이에요. 잠시 시간이 걸릴 수 있어요." />}
      {room.public_status === "INSUFFICIENT_PARTICIPANTS" && <StateCard icon={<Users />} title="조율에 필요한 인원이 부족해요" body="최소 두 명의 제출이 필요해 후보를 만들지 않았어요." />}
      {room.public_status === "ANALYSIS_DELAYED" && <DelayedState key={`delayed:${ownerKey}`} room={room} onRetried={setRoom} onAccessDenied={privateAccessDenied} />}
      {room.public_status === "NO_MATCH" && <><StateCard icon={<AlertCircle />} title="모두에게 맞는 후보를 찾지 못했어요" body="반영 가능한 조건에서 함께할 일정을 찾지 못했어요. 일부 입력은 반영되지 않았을 수 있어요. 저장한 조건을 확인하고, 조건 수정을 열 수 있을 때 다시 조율해 보세요." />{room.viewer.role === "HOST" && <UnappliedInputs key={`unapplied:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}</>}
      {(room.public_status === "READY" || room.public_status === "READY_WITH_WARNINGS") && <CandidatesPanel key={`candidates:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      {room.public_status === "CONFIRMED" && <ResultPanel key={`result:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      {room.public_status !== "COLLECTING" && <RecoveryActions key={`recovery:${ownerKey}`} room={room} onRoomChanged={setRoom} onAccessDenied={privateAccessDenied} />}
      {(room.submission_protocol !== "PRE_SUBMIT_V1" || correctionOpen(room)) && (room.public_status !== "COLLECTING" || (correctionOpen(room) && !room.capabilities?.can_edit_own_submission)) && <SavedSubmissionPanel key={`saved:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      {room.submission_protocol !== "PRE_SUBMIT_V1" && room.clarification_protocol === "owner-clarification-v1" && room.collection_status === "CLOSED" && room.public_status !== "CONFIRMED" && <ClarificationPanel key={`clarification:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} onPendingChange={pending => setClarificationPendingOwner(previous => pending ? ownerKey : previous === ownerKey ? null : previous)} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["submission", room.invite_code] }); void queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); }} />}
      <RoomHistoryNotice />
    </div>
  );
}

function ownSubmissionKey(room: Room): readonly string[] {
  return room.viewer.context_id ? ["submission", room.invite_code, room.viewer.context_id] : ["submission", room.invite_code];
}

function SavedSubmissionPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const submission = useQuery({
    queryKey: ownSubmissionKey(room),
    queryFn: async ({ signal }) => {
      try { const incoming = await api.getSubmission(room.invite_code, signal); const previous = queryClient.getQueryData<Submission>(ownSubmissionKey(room)); return previous && previous.revision > incoming.revision ? previous : incoming; }
      catch (error) { if (error instanceof ApiError && error.status === 404 && error.problem.code === "SUBMISSION_NOT_FOUND") return null; throw error; }
    },
    enabled: open,
    retry: false,
  });
  useEffect(() => {
    if (submission.error instanceof ApiError && [401, 403, 404].includes(submission.error.status)) onAccessDenied(submission.error);
  }, [submission.error, onAccessDenied]);
  return <details className="saved-submission glass-card" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>내 저장 입력 확인</summary>
    {open && (submission.isPending ? <p role="status">저장한 입력을 불러오는 중…</p> : submission.isError ? <div className="alert error" role="alert">{errorMessage(submission.error)}<button className="button secondary" onClick={() => submission.refetch()} disabled={submission.isFetching}>다시 시도</button></div> : submission.data ? <>
      <p className="saved-revision">저장된 입력 #{submission.data.revision}</p>
      <p className="submitted-text">{submission.data.raw_text ?? "기존 시간표만 제출되어 자연어 원문이 없어요."}</p>
      <p className="field-hint">내가 저장한 입력이에요. 입력 마감 후에는 이 화면에서 수정할 수 없어요.</p>
    </> : <p>저장한 입력이 없어요.</p>)}
  </details>;
}

function RoomHeader({ room }: { room: Room }) {
  const participantId = "participant_id" in room.viewer && typeof room.viewer.participant_id === "string" ? room.viewer.participant_id : null;
  return <section className="room-header glass-card"><div><span className="room-kicker">{room.viewer.role === "HOST" ? "내가 만든 모임" : `${room.viewer.display_name}님이 참여한 모임`}</span><h1>{room.purpose}</h1><p>{formatDate(room.search_start_date)}부터 {formatDate(room.search_end_date)} 전까지 · {room.meeting_mode === "REMOTE" ? "비대면" : room.meeting_mode === "IN_PERSON" ? "대면" : "대면·비대면 모두"}</p>{participantId && <p className="field-hint guest-record-notice">내 참여 기록 번호: <strong>{participantId}</strong><br />다른 기기에서 같은 이름의 기록을 구분할 때 사용해요. 번호만으로 기존 원문을 읽을 수는 없어요.</p>}</div><CopyRoomLink room={room} /></section>;
}

function RecoveryActions({ room, onRoomChanged, onAccessDenied, blocked = false }: { room: Room; onRoomChanged: (room: Room) => void; onAccessDenied: (error: ApiError) => void; blocked?: boolean }) {
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [force, setForce] = useState(false);
  const operation = useRef<{ identity: string; requestId: string } | null>(null);
  const editing = correctionOpen(room);
  const host = room.viewer.role === "HOST";
  const canOpen = host && !!room.capabilities?.can_open_revision && !!room.analysis_id && ["NO_MATCH", "READY_WITH_WARNINGS"].includes(room.public_status);
  const canAnalyze = host && editing && !!room.capabilities?.can_analyze_revision;
  const run = useMutation<ReopenResponse | ReanalyzeResponse, Error, void>({
    mutationKey: ["room", room.invite_code],
    mutationFn: () => {
      const forceReparse = force && !!room.capabilities?.can_force_reparse;
      const identity = editing ? `${room.invite_code}:analyze:${room.revision_round!.id}:${forceReparse}` : `${room.invite_code}:open:${room.analysis_id}:${room.revision_generation}`;
      if (operation.current?.identity !== identity) operation.current = { identity, requestId: crypto.randomUUID() };
      return editing ? api.analyzeRevision(room.invite_code, { revision_round_id: room.revision_round!.id, request_id: operation.current.requestId, force_reparse: forceReparse }) : api.reopenRoom(room.invite_code, { request_id: operation.current.requestId, source_analysis_id: room.analysis_id!, expected_generation: room.revision_generation! });
    },
    onSuccess: async response => {
      if (!mounted.current) return;
      operation.current = null;
      const previous = queryClient.getQueryData<Room>(["room", room.invite_code]);
      if (previous?.state_version !== undefined && response.room.state_version !== undefined && response.room.state_version < previous.state_version) return;
      const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === room.invite_code && ["candidates", "recommendations", "unapplied", "result"].includes(String(query.queryKey[0])) };
      await queryClient.cancelQueries(filters);
      queryClient.removeQueries(filters);
      if (!mounted.current) return;
      onRoomChanged(response.room);
    },
    onError: error => {
      if (!mounted.current || !(error instanceof ApiError)) return;
      if ([401, 403, 404].includes(error.status)) onAccessDenied(error);
      else if (error.status === 409) void queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] });
    },
  });
  return <>
    <AnalysisRecoveryPanel available={editing || canOpen} editing={editing} host={editing ? canAnalyze : canOpen} pending={run.isPending} blocked={blocked} error={run.isError ? errorMessage(run.error) : undefined} onOpen={() => run.mutate()} onAnalyze={() => run.mutate()}>
      {room.remaining_correction_analyses === 0 && <div className="alert warning" role="status"><p>새 분석 횟수를 모두 사용했어요.</p><p>입력 수정과 저장은 가능하지만 바꾼 입력으로 새 결과를 만들 수 없어요.</p><p>입력을 바꾸지 않으면 기존 결과를 다시 사용할 수 있어요.</p><p>원문을 되돌려 저장해도 새 분석이 필요해 기존 결과를 재사용할 수 없어요.</p></div>}
      {canAnalyze && room.capabilities?.can_force_reparse && <label className="recovery-force"><input type="checkbox" checked={force} disabled={run.isPending} onChange={event => setForce(event.target.checked)} /> 바꾸지 않은 입력도 다시 해석</label>}
      {canAnalyze && room.remaining_correction_analyses !== undefined && room.remaining_correction_analyses > 0 && <p className="field-hint">새 결과를 만들거나 다시 해석하면 추가 분석 횟수를 사용해요. 남은 새 분석: {room.remaining_correction_analyses}회</p>}
      {canAnalyze && blocked && <p className="field-hint">내 수정 내용을 먼저 저장하거나 취소해 주세요. 다른 참여자가 저장한 입력은 그대로 사용해요.</p>}
    </AnalysisRecoveryPanel>
  </>;
}

function CopyRoomLink({ room, primary = false, result = false }: { room: Room; primary?: boolean; result?: boolean }) {
  const [feedback, setFeedback] = useState<"success" | "manual" | null>(null);
  const [pending, setPending] = useState(false);
  const url = roomLink(room.invite_code);
  const copy = async () => {
    setPending(true);
    setFeedback(null);
    try { await navigator.clipboard.writeText(url); setFeedback("success"); }
    catch { setFeedback("manual"); }
    finally { setPending(false); }
  };
  return <div className={`room-copy ${result ? "result-copy" : ""}`}>
    <button className={`button ${primary ? "primary" : "secondary"}`} onClick={copy} disabled={pending}>{feedback === "success" ? <CheckCircle2 size={18} /> : result ? <Copy size={18} /> : <Share2 size={18} />}{result ? "결과 링크 복사" : "초대 링크 복사"}</button>
    {feedback && <p className="copy-feedback" role="status">{feedback === "success" ? "링크를 복사했어요." : "자동으로 복사하지 못했어요. 아래 링크를 선택해 직접 복사해 주세요."}</p>}
    {feedback === "manual" && <input className="manual-copy-link" aria-label="직접 복사할 링크" readOnly value={url} onFocus={event => event.target.select()} />}
  </div>;
}

function RoomHistoryNotice() {
  const account = useAccountSession();
  if (account) return <p className="room-history-note">계정으로 주최하거나 참여한 모임은 <Link to="/account/rooms">내 모임</Link>에서 다시 찾을 수 있어요.</p>;
  return <p className="room-history-note">공유받은 초대 링크로 이 모임을 다시 열 수 있어요. 다른 기기에서 열거나 본인 인증 정보가 만료되면 기존 참여 기록에서 본인 확인이 필요할 수 있어요.</p>;
}

function SubmissionPanel({ room, onRoomChanged, onAccessDenied, draft, onDraftChanged, clarificationPending = false }: { room: Room; onRoomChanged: (room: Room) => void; onAccessDenied: (error: ApiError) => void; draft: string | null; onDraftChanged: (room: Room, rawText: string | null) => void; clarificationPending?: boolean }) {
  const correcting = correctionOpen(room);
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState(draft ?? "");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [savedRawText, setSavedRawText] = useState("");
  const [editing, setEditing] = useState(false);
  const latestInput = useRef("");
  const latestRawInput = useRef(rawText); latestRawInput.current = rawText;
  const submittedRawInput = useRef<string | null>(null);
  const conditionInput = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const closing = useRef(false);
  const latestRoom = useRef(room); latestRoom.current = room;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submissionQuery = useQuery<Submission | null>({
    queryKey: ownSubmissionKey(room),
    queryFn: async ({ signal }) => { try { const incoming = await api.getSubmission(room.invite_code, signal); const previous = queryClient.getQueryData<Submission>(ownSubmissionKey(room)); return previous && previous.revision > incoming.revision ? previous : incoming; } catch (error) { if (error instanceof ApiError && error.status === 404 && error.problem.code === "SUBMISSION_NOT_FOUND") return null; throw error; } },
  });
  useEffect(() => {
    if (submissionQuery.data && (loadedRevision === null || submissionQuery.data.revision > loadedRevision)) {
      const receivedText = submissionQuery.data.raw_text ?? "";
      setRawText(current => loadedRevision === null ? draft ?? receivedText : submissionText(current).text === savedRawText ? receivedText : current);
      setSavedRawText(receivedText);
      setLoadedRevision(submissionQuery.data.revision);
    }
  }, [submissionQuery.data, loadedRevision, savedRawText, draft]);
  const privateDraft = usePrivateDraft({ room, editorKind: "LEGACY", revision: submissionQuery.data?.revision ?? 0, fresh: submissionQuery.isSuccess && submissionQuery.isFetchedAfterMount && !submissionQuery.isFetching, onRecovered: raw => { setRawText(raw); latestInput.current = submissionText(raw).text; setEditing(true); } });
  const discardPrivateDraft = privateDraft.discard;
  const refreshRoom = useMutation({ mutationKey: ["room", room.invite_code], mutationFn: () => api.getRoom(room.invite_code), onSuccess: refreshed => { if (mounted.current) onRoomChanged(refreshed); }, onError: error => { if (mounted.current && error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error); } });
  const save = useMutation({
    mutationKey: ownSubmissionKey(room),
    mutationFn: (text: string) => api.saveSubmission(room.invite_code, { raw_text: text, ...(correcting ? { revision_round_id: room.revision_round!.id, expected_revision: loadedRevision! } : {}) }),
    onSuccess: (submission) => {
      if (!mounted.current) return;
      const previous = queryClient.getQueryData<Submission>(ownSubmissionKey(room));
      if (previous && previous.revision > submission.revision) return;
      const newerExactDraft = latestRawInput.current !== submittedRawInput.current;
      setRawText(current => newerExactDraft ? current : submission.raw_text);
      setSavedRawText(submission.raw_text);
      setLoadedRevision(submission.revision);
      queryClient.setQueryData(ownSubmissionKey(room), submission);
      setEditing(newerExactDraft);
      if (!newerExactDraft) privateDraft.discard();
      onDraftChanged(room, newerExactDraft ? latestRawInput.current : null);
      refreshRoom.mutate();
    },
    onSettled: () => { saving.current = false; },
  });
  const close = useMutation({
    mutationKey: ["room", room.invite_code],
    mutationFn: (confirmEarly: boolean) => api.closeRoom(room.invite_code, confirmEarly),
    onSuccess: refreshed => { if (mounted.current) onRoomChanged(refreshed); },
    onSettled: () => { closing.current = false; },
    onError: (error) => {
      if (!mounted.current) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onAccessDenied(error); return; }
    },
  });
  useEffect(() => {
    for (const error of [submissionQuery.error, save.error]) if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { if ([403, 404].includes(error.status)) discardPrivateDraft(); onAccessDenied(error); }
    if (save.error instanceof ApiError && save.error.status === 409) { void queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); void queryClient.invalidateQueries({ queryKey: ["submission", room.invite_code] }); }
  }, [submissionQuery.error, save.error, onAccessDenied, queryClient, room.invite_code, discardPrivateDraft]);
  const { text, length, valid } = submissionText(rawText);
  const dirty = text !== savedRawText;
  const dirtyInput = useRef(false); dirtyInput.current = rawText !== savedRawText;
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyInput.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload);
  }, []);
  useEffect(() => { onDraftChanged(room, dirty ? rawText : null); }, [room, rawText, dirty, onDraftChanged]);
  const legacyManualOnly = submissionQuery.data?.raw_text === null;

  const completed = !!submissionQuery.data?.raw_text && !editing && !dirty;
  const host = room.viewer.role === "HOST";
  const saveUncertain = !(save.error instanceof ApiError) || save.error.status >= 500 || save.error.status === 408;
  const saveConfirmedByRead = save.variables !== undefined && submissionQuery.data?.raw_text === save.variables;

  return <div className="submission-layout submission-layout--single"><section className={"glass-card submission-card " + (completed ? "submission-complete" : "")}>
    {host && !correcting && save.isIdle && submissionQuery.isSuccess && submissionQuery.data === null && loadedRevision === null && <div className="submission-next">
      <span className="eyebrow success"><CheckCircle2 size={15} /> 방 생성 완료</span>
      <h2>모임이 만들어졌어요</h2>
      <p>위의 초대 링크를 먼저 공유해도 좋아요. 아직 내 조건은 제출하지 않았어요. 주최자도 예상 인원에 포함되며, 조건을 제출해야 제출 인원으로 집계돼요.</p>
      <div className="actions"><button className="button secondary" onClick={() => conditionInput.current?.focus()}>내 조건 입력하기</button>{!dirty && <Link className="button secondary" to="/">나중에 입력하기</Link>}</div>
      <p className="field-hint">마감 전까지 이 브라우저에서 같은 링크로 돌아와 입력할 수 있어요.</p>
    </div>}
    {completed ? <>
      <div className="section-heading"><span className="eyebrow success"><CheckCircle2 size={15} /> 제출 완료</span><h2>조건 제출을 완료했어요</h2><p>조건이 안전하게 저장됐어요.</p></div>
      {!correcting && <div className="submission-next"><h3>{host ? "초대 링크를 공유해 주세요" : "입력 마감을 기다려 주세요"}</h3><p>{host ? "참여자에게 링크를 보내 조건을 모아 주세요. 입력이 마감되면 분석을 시작해요." : "입력이 마감되면 분석을 시작해요. 진행 상태는 자동으로 갱신돼요."}</p>{host && <CopyRoomLink room={room} primary />}</div>}
      <div className="submitted-condition"><span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span><p className="submitted-text">{submissionQuery.data?.raw_text}</p><button className="button secondary" disabled={submissionQuery.data?.editable === false || (correcting && !room.capabilities?.can_edit_own_submission) || save.isPending} onClick={() => { save.reset(); setEditing(true); }}>내 조건 수정</button></div>
    </> : <>
      <div className="section-heading"><span className="eyebrow subtle"><LockKeyhole size={14} /> 비공개로 모으는 조건</span><h2>{loadedRevision ? "내 조건을 수정해 주세요" : "가능한 조건을 알려주세요"}</h2><p>가능한 시간과 장소 조건을 자연어로 입력해 주세요.</p></div>
      <p id="submission-privacy" className="submission-privacy">반영된 조건은 다른 참여자에게 공개되지 않아요. 분석에 반영하지 못한 원문은 주최자에게 공개될 수 있어요.</p>
      {submissionQuery.isPending ? <div className="inline-loading"><LoaderCircle className="spin" /> 기존 입력 확인 중…</div> : submissionQuery.isError ? <div className="alert error">{errorMessage(submissionQuery.error)}</div> : <>
        {legacyManualOnly && <div className="alert warning" role="status">기존 시간표 입력은 보존되어 있어요. 가능한 시간을 자연어로 다시 입력하고 저장해 주세요.</div>}
        <label className="field"><span>시간·장소 조건 <small>필수</small></span><textarea ref={conditionInput} autoFocus={editing} aria-describedby="submission-time-guide submission-count submission-hint submission-privacy" aria-invalid={length > SUBMISSION_TEXT_LIMIT} rows={4} value={rawText} onChange={(event) => { latestInput.current = submissionText(event.target.value).text; privateDraft.remember(event.target.value, loadedRevision ?? 0); setRawText(event.target.value); }} placeholder={submissionExample(room.meeting_mode)} /><small id="submission-count" className={"character-count " + (length > SUBMISSION_TEXT_LIMIT ? "field-error" : "")}>{length}/{SUBMISSION_TEXT_LIMIT}</small></label>
        <p id="submission-time-guide" className="field-hint">{TIME_INPUT_GUIDE}</p>
        <p id="submission-hint" className="field-hint">앞뒤 공백을 제외하고 1~500자로 입력해 주세요.</p>
        <div className="submission-footer"><div>{loadedRevision ? <span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span> : <span className="field-hint">조건은 마감 전까지 수정할 수 있어요.</span>}</div><div className="submission-actions">{editing && <button className="button secondary" disabled={save.isPending} onClick={() => { privateDraft.discard(); setRawText(submissionQuery.data?.raw_text ?? ""); save.reset(); setEditing(false); }}>수정 취소</button>}<button className="button primary" onClick={() => { if (saving.current) return; saving.current = true; submittedRawInput.current = rawText; latestInput.current = text; save.mutate(text); }} disabled={!valid || !dirty || save.isPending || submissionQuery.data?.editable === false || (correcting && !room.capabilities?.can_edit_own_submission)}>{save.isPending ? "저장 중…" : loadedRevision ? "수정 내용 저장" : "조건 제출하기"}</button></div></div>
      </>}
    </>}
    {privateDraft.conflictPanel}
    {!completed && dirty && loadedRevision !== null && <div className="alert warning" role="status">수정한 내용이 아직 저장되지 않았어요.</div>}
    {!completed && loadedRevision !== null && !dirty && !legacyManualOnly && <div className="alert success" role="status">조건이 안전하게 저장됐어요.</div>}
    <p className="submission-privacy">{correcting ? "저장은 분석 완료를 뜻하지 않아요. 주최자가 다시 분석하면 저장한 조건을 사용해요." : "저장은 분석 완료를 뜻하지 않아요. 입력 마감 후 조건을 분석해요."}</p>
    {refreshRoom.isError && <div className="alert warning refresh-warning" role="status"><span>조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.</span><button className="button secondary" onClick={() => refreshRoom.mutate()}>진행 상태 다시 확인</button></div>}
    {save.isError && !saveConfirmedByRead && <div className="alert error"><p>{saveUncertain ? "조건 저장 결과를 확인하지 못했어요. 모임을 다시 만들 필요는 없어요. 저장 여부를 확인한 뒤 이 방에서 다시 시도해 주세요." : "조건 저장 요청이 거절됐어요. 아래 내용을 확인해 주세요."}</p>{errorMessage(save.error)}</div>}
    {correcting ? <div className="host-tools-inline"><RecoveryActions room={room} onRoomChanged={onRoomChanged} onAccessDenied={onAccessDenied} blocked={dirty || save.isPending || clarificationPending} /></div> : host && <div className="host-tools-inline"><h3>주최자 도구</h3>
      <RoomCloseConfirmation disabled={close.isPending || save.isPending || clarificationPending} pending={close.isPending} unsaved={dirty} error={close.isError ? errorMessage(close.error) : undefined}
        onConfirm={() => { if (closing.current || !mounted.current || latestRoom.current.viewer.role !== "HOST" || latestRoom.current.collection_status === "CLOSED") return; closing.current = true; close.mutate(true); }} />
    </div>}
  </section></div>;
}

function DelayedState({ room, onRetried, onAccessDenied }: { room: Room; onRetried: (room: Room) => void; onAccessDenied: (error: ApiError) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const retry = useMutation({ mutationKey: ["room", room.invite_code], mutationFn: () => api.retryAnalysis(room.invite_code), onSuccess: refreshed => { if (mounted.current) onRetried(refreshed); }, onError: error => { if (mounted.current && error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error); } });
  return <StateCard icon={<TriangleAlert />} title="분석이 잠시 지연되고 있어요" body="이미 접수된 입력은 안전하게 저장되어 있어 다시 제출할 필요가 없어요." action={room.viewer.role === "HOST" ? <button className="button primary" onClick={() => retry.mutate()} disabled={retry.isPending}><RefreshCw size={17} /> {retry.isPending ? "요청 중…" : "분석 다시 요청"}</button> : undefined} error={retry.isError ? errorMessage(retry.error) : undefined} />;
}

function CandidatesPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  if (room.recommendation_protocol == null) return <LegacyCandidatesPanel room={room} onAccessDenied={onAccessDenied} />;
  if (room.recommendation_protocol !== RECOMMENDATION_PROTOCOL) return <StateCard icon={<RefreshCw />} title="추천 화면 업데이트가 필요해요" body="새로고침해 최신 화면을 확인해 주세요." />;
  return <><RecommendationsPanel key={`${room.analysis_id}:${viewerContext(room)}`} room={room} onAccessDenied={onAccessDenied} />{room.public_status === "READY_WITH_WARNINGS" && room.viewer.role === "HOST" && <UnappliedInputs room={room} onAccessDenied={onAccessDenied} />}</>;
}

function LegacyCandidatesPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const queryClient = useQueryClient();
  const candidates = useQuery({ queryKey: ["candidates", room.invite_code, room.analysis_id ?? "legacy"], queryFn: () => api.getCandidates(room.invite_code) });
  const confirm = useMutation({ mutationKey: ["candidates", room.invite_code], mutationFn: (id: string) => api.confirmCandidate(room.invite_code, id), onSuccess: () => { if (mounted.current) return queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); }, onError: (error) => { if (!mounted.current) return; if (error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error); else if (error instanceof ApiError && error.status === 409) queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); } });
  useEffect(() => { if (candidates.error instanceof ApiError && [401, 403, 404].includes(candidates.error.status)) onAccessDenied(candidates.error); }, [candidates.error, onAccessDenied]);
  if (candidates.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="후보를 불러오고 있어요" />;
  if (candidates.isError) return <StateCard icon={<AlertCircle />} title="후보를 불러오지 못했어요" body={errorMessage(candidates.error)} action={<button className="button secondary" onClick={() => candidates.refetch()}>다시 시도</button>} />;
  if (room.analysis_id && (candidates.data as typeof candidates.data & { analysis_id?: string }).analysis_id !== room.analysis_id) return <StateCard icon={<RefreshCw />} title="최신 후보를 다시 확인해 주세요" action={<button className="button secondary" onClick={() => candidates.refetch()}>다시 시도</button>} />;
  const partial = candidates.data.quality === "PARTIAL";
  const hasCandidates = candidates.data.candidates.length > 0;
  return <section className="results-section">
    <div className="section-heading centered"><span className="eyebrow subtle"><Sparkles size={15} /> 후보 계산 완료</span><h2>{!hasCandidates ? "선택할 수 있는 후보가 없어요" : partial ? "일부 조건으로 만든 후보 플랜이에요" : "함께할 수 있는 후보 플랜이에요"}</h2><p>{hasCandidates ? <>계산된 우선순위대로 보여드려요. {room.viewer.role === "HOST" ? "가능한 시간과 지역을 확인하고 플랜 하나를 선택해 주세요." : "주최자가 플랜을 선택하면 결과를 볼 수 있어요."}</> : "반영 가능한 조건에서 함께할 일정을 찾지 못했어요. 다음 모임에서는 탐색 기간이나 조건을 조정해 보세요."}</p></div>
    {partial && <div className="alert warning"><TriangleAlert size={18} /> 일부 입력이 반영되지 않아 반영 가능한 조건으로 만든 결과예요. ({candidates.data.applied_submissions}/{candidates.data.total_submissions}개 반영)</div>}
    {room.public_status === "READY_WITH_WARNINGS" && room.viewer.role === "HOST" && <UnappliedInputs room={room} count={candidates.data.unapplied_inputs} onAccessDenied={onAccessDenied} />}
    <div className="candidate-list">{candidates.data.candidates.map((candidate) => <CandidateCard key={candidate.candidate_id} candidate={candidate} canConfirm={room.viewer.role === "HOST" && (!room.capabilities || room.capabilities.can_confirm)} pending={confirm.isPending} selectionWarning={partial ? `${candidates.data.applied_submissions}/${candidates.data.total_submissions}개 입력 반영 · 일부 입력을 제외하고 만든 후보예요.` : undefined} onConfirm={() => { if (candidate.candidate_id && window.confirm(`Plan ${candidate.plan_type}을 선택할까요? 실제 모임 날짜·시간은 따로 정해 공지해 주세요.`)) confirm.mutate(candidate.candidate_id); }} />)}</div>
    {confirm.isError && <div className="alert error">{errorMessage(confirm.error)}</div>}
  </section>;
}

function UnappliedInputs({ room, count, onAccessDenied }: { room: Room; count?: number; onAccessDenied: (error: ApiError) => void }) {
  const unapplied = useQuery({ queryKey: ["unapplied", room.invite_code, room.analysis_id ?? "legacy"], queryFn: () => api.getUnappliedInputs(room.invite_code), enabled: room.viewer.role === "HOST" });
  useEffect(() => { if (unapplied.error instanceof ApiError && [401, 403, 404].includes(unapplied.error.status)) onAccessDenied(unapplied.error); }, [unapplied.error, onAccessDenied]);
  return <details className="unapplied glass-card"><summary>반영되지 않은 입력{count === undefined ? "" : ` ${count}개`} 확인</summary>{unapplied.isPending ? <p>불러오는 중…</p> : unapplied.isError ? <div className="alert error">{errorMessage(unapplied.error)}<button className="button secondary" onClick={() => unapplied.refetch()}>다시 시도</button></div> : unapplied.data.length === 0 ? <p>반영되지 않은 입력이 없어요.</p> : unapplied.data.map((item, index) => <article key={index}><strong>{item.participant_display_name}</strong><p>{item.raw_text ?? (room.submission_protocol === "PRE_SUBMIT_V1" ? "개인 입력 원문은 비공개예요." : "기존 시간표만 제출되어 자연어 원문이 없어요.")}</p><small>{Object.hasOwn(UNAPPLIED_REASON_MESSAGES, item.reason) ? UNAPPLIED_REASON_MESSAGES[item.reason] : item.reason}</small></article>)}</details>;
}

function ResultPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  const result = useQuery({ queryKey: ["result", room.invite_code], queryFn: () => api.getResult(room.invite_code) });
  useEffect(() => { if (result.error instanceof ApiError && [401, 403, 404].includes(result.error.status)) onAccessDenied(result.error); }, [result.error, onAccessDenied]);
  if (result.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="선택한 플랜을 불러오는 중이에요" />;
  if (result.isError) return <StateCard icon={<AlertCircle />} title="결과를 불러오지 못했어요" body={errorMessage(result.error)} />;
  const saved = result.data.selection;
  if (saved) {
    if (saved.protocol !== RECOMMENDATION_PROTOCOL) return <StateCard icon={<RefreshCw />} title="추천 화면 업데이트가 필요해요" body="새로고침해 최신 화면을 확인해 주세요." />;
    const candidate = result.data.candidate;
    return <><section className="results-section"><div className="section-heading centered"><span className="eyebrow success"><CheckCircle2 size={15} /> 일정 확정 완료</span><h2>실제 모임 일정이 확정됐어요</h2></div><div className="candidate-list single"><article className="candidate-card recommendation-card" aria-label="확정된 모임 일정"><h3>확정된 모임 일정</h3><p>{formatRecommendationRange(saved.start_at, saved.end_at, room.time_zone_id)}</p><p>{candidate.attendance_count}/{candidate.total_participants}명 참석 가능 · {candidate.meeting_mode === "REMOTE" ? "온라인 · 접속 정보 별도 공지" : `대면 · ${candidate.place?.display_name ?? "장소 협의"}`}</p></article></div><CopyRoomLink room={room} result /></section>{room.review_prompt_supported === true ? <ReviewPrompt inviteCode={room.invite_code} viewerKey={viewerContext(room)} /> : null}</>;
  }
  return <><section className="results-section"><div className="section-heading centered"><span className="eyebrow success"><CheckCircle2 size={15} /> 플랜 선택 완료</span><h2>주최자가 선택한 플랜이에요</h2><p>{formatDateTime(result.data.confirmed_at)}에 주최자가 Plan {result.data.candidate.plan_type}을 선택했어요.</p></div><div className="candidate-list single"><CandidateCard candidate={result.data.candidate} canConfirm={false} confirmed /></div><CopyRoomLink room={room} result /></section>{room.review_prompt_supported === true ? <ReviewPrompt inviteCode={room.invite_code} viewerKey={viewerContext(room)} /> : null}</>;
}

function StateCard({ icon, title, body, action, error }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode; error?: string }) { return <div className="center-state glass-card"><div className="large-icon">{icon}</div><h1>{title}</h1>{body && <p>{body}</p>}{error && <div className="alert error">{error}</div>}{action}<Link className="text-link" to="/">새 모임 만들기</Link></div>; }
