import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Sparkles, TriangleAlert, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, errorMessage } from "../api/client";
import type { Submission } from "../api/types";
import { correctionOpen, currentRoom, viewerContext, type RecoveryRoom as Room, type ReopenResponse, type ReanalyzeResponse } from "../api/recovery";
import AnalysisRecoveryPanel from "../components/AnalysisRecoveryPanel";
import { CandidateCard } from "../components/CandidateCard";
import { formatDate, formatDateTime } from "../utils/time";
import { submissionText, SUBMISSION_TEXT_LIMIT } from "../utils/submission";
import { useRecentRooms } from "../hooks/useRecentRooms";
import { rememberRoom, roomLink } from "../utils/recentRooms";

const UNAPPLIED_REASON_MESSAGES: Record<string, string> = {
  LEGACY_MANUAL_ONLY_UNSUPPORTED: "기존 시간표 입력은 새 분석에서 지원하지 않아 반영되지 않았어요.",
  UNSUPPORTED_CONDITIONAL_CONSTRAINT: "장소에 따라 시간이 달라지는 등 조건별로 시간과 장소를 연결한 입력은 현재 처리할 수 없어요. 이 입력은 후보 계산에 반영되지 않았어요.",
  AMBIGUOUS_TIME_CONSTRAINT: "가능한 시간이 명확하지 않아 이 입력을 후보 계산에 반영하지 못했어요. 날짜와 시작·종료 시간을 구체적으로 적어 주세요.",
};

export default function RoomPage() {
  const { inviteCode = "" } = useParams();
  const queryClient = useQueryClient();
  const recent = useRecentRooms();
  const [draft, setDraft] = useState<{ inviteCode: string; viewer: string; rawText: string } | null>(null);
  const accessEpoch = useRef(0);
  const updateDraft = useCallback((room: Room, rawText: string | null) => setDraft(previous => rawText === null ? null : previous?.inviteCode === room.invite_code && previous.viewer === viewerContext(room) && previous.rawText === rawText ? previous : { inviteCode: room.invite_code, viewer: viewerContext(room), rawText }), []);
  useEffect(() => { setDraft(null); }, [inviteCode]);
  const [accessFailure, setAccessFailure] = useState<{ inviteCode: string; error: Error } | null>(null);
  const deniedRoom = useRef<string | null>(null);
  const denyAccess = useCallback((error: ApiError) => { accessEpoch.current++; setDraft(null); deniedRoom.current = inviteCode; setAccessFailure({ inviteCode, error }); }, [inviteCode]);
  const roomQuery = useQuery({
    queryKey: ["room", inviteCode],
    queryFn: async ({ signal }) => {
      const readEpoch = accessEpoch.current;
      const incoming = await api.getRoom(inviteCode, signal);
      const previous = queryClient.getQueryData<Room>(["room", inviteCode]);
      if (signal.aborted || readEpoch !== accessEpoch.current) return previous ?? incoming;
      if (previous && viewerContext(previous) !== viewerContext(incoming)) {
        accessEpoch.current++;
        const contextEpoch = accessEpoch.current;
        setDraft(null);
        const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission", "candidates", "unapplied", "result"].includes(String(query.queryKey[0])) };
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
    if (previous && viewerContext(previous) !== viewerContext(room)) {
      accessEpoch.current++;
      setDraft(null);
      const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission", "candidates", "unapplied", "result"].includes(String(query.queryKey[0])) };
      void queryClient.cancelQueries(filters);
      queryClient.removeQueries(filters);
    }
    queryClient.setQueryData<Room>(["room", inviteCode], currentRoom(previous, room));
  };
  const privateAccessDenied = (error: ApiError) => { if (epoch === accessEpoch.current) denyAccess(error); };
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
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["submission", "candidates", "unapplied", "result"].includes(String(query.queryKey[0])) };
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
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === inviteCode && ["room", "submission", "candidates", "unapplied", "result"].includes(String(query.queryKey[0])) };
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
  const showEditor = room.public_status === "COLLECTING" && (!correctionOpen(room) || room.capabilities?.can_edit_own_submission);

  if (!room.viewer.joined) return room.public_status === "COLLECTING" && room.collection_status === "COLLECTING" ? <JoinRoom room={room} onJoined={setRoom} previouslySaved={recent.rooms.some(item => item.inviteCode === inviteCode)} /> : <StateCard icon={<LockKeyhole />} title="입력이 마감된 모임이에요" body="참여했던 브라우저에서 다시 열어 주세요. 참여 정보가 삭제되거나 만료되면 보관한 링크만으로 기존 권한이나 결과를 복구할 수 없어요." />;

  return (
    <div className="room-page page-width">
      <RoomHeader room={room} />
      {roomQuery.isError && <div className="alert warning room-refresh-warning" role="status"><span>모임 상태를 갱신하지 못했어요. 마지막으로 확인한 상태를 보여드려요.</span><button className="button secondary" disabled={roomQuery.isFetching} onClick={() => roomQuery.refetch()}>진행 상태 다시 확인</button></div>}
      {showEditor && <SubmissionPanel key={`submission:${ownerKey}`} room={room} onRoomChanged={setRoom} onAccessDenied={privateAccessDenied} draft={currentDraft} onDraftChanged={updateDraft} />}
      {!showEditor && currentDraft !== null && <section className="glass-card side-card"><h2>저장하지 않은 수정 내용</h2><p>저장하지 않은 수정 내용은 분석에 포함되지 않아요. 이 화면에 임시로 보관했고, 조건 수정을 다시 열 수 있을 때 이어서 편집할 수 있어요. 새로고침하거나 다른 모임으로 이동하면 사라져요.</p><label className="field"><span>내 임시 수정 내용</span><textarea readOnly value={currentDraft} rows={4} /></label><button className="button secondary" onClick={() => setDraft(null)}>임시 수정 버리기</button></section>}
      {room.public_status === "COLLECTING" && correctionOpen(room) && !room.capabilities?.can_edit_own_submission && <StateCard icon={<LockKeyhole />} title="조건을 수정하는 중이에요" body="기존에 입력을 제출한 참여자가 자신의 입력을 수정할 수 있어요." />}
      {room.public_status === "ANALYZING" && <StateCard icon={<LoaderCircle className="spin" />} title="모두의 조건을 분석하고 있어요" body="입력은 안전하게 저장됐어요. 최적의 플랜을 만드는 데 잠시 시간이 걸릴 수 있어요." />}
      {room.public_status === "INSUFFICIENT_PARTICIPANTS" && <StateCard icon={<Users />} title="조율에 필요한 인원이 부족해요" body="최소 두 명의 제출이 필요해 후보를 만들지 않았어요." />}
      {room.public_status === "ANALYSIS_DELAYED" && <DelayedState key={`delayed:${ownerKey}`} room={room} onRetried={setRoom} onAccessDenied={privateAccessDenied} />}
      {room.public_status === "NO_MATCH" && <><StateCard icon={<AlertCircle />} title="모두에게 맞는 후보를 찾지 못했어요" body="반영 가능한 조건에서 함께할 일정을 찾지 못했어요. 일부 입력은 반영되지 않았을 수 있어요. 저장한 조건을 확인하고, 조건 수정을 열 수 있을 때 다시 조율해 보세요." />{room.viewer.role === "HOST" && <UnappliedInputs key={`unapplied:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}</>}
      {(room.public_status === "READY" || room.public_status === "READY_WITH_WARNINGS") && <CandidatesPanel key={`candidates:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      {room.public_status === "CONFIRMED" && <ResultPanel key={`result:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      {room.public_status !== "COLLECTING" && <RecoveryActions key={`recovery:${ownerKey}`} room={room} onRoomChanged={setRoom} onAccessDenied={privateAccessDenied} />}
      {(room.public_status !== "COLLECTING" || (correctionOpen(room) && !room.capabilities?.can_edit_own_submission)) && <SavedSubmissionPanel key={`saved:${ownerKey}`} room={room} onAccessDenied={privateAccessDenied} />}
      <RoomHistoryNotice room={room} />
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
  return <section className="room-header glass-card"><div><span className="room-kicker">{room.viewer.role === "HOST" ? "내가 만든 모임" : `${room.viewer.display_name}님이 참여한 모임`}</span><h1>{room.purpose}</h1><p>{formatDate(room.search_start_date)}부터 {formatDate(room.search_end_date)} 전까지 · {room.meeting_mode === "REMOTE" ? "비대면" : room.meeting_mode === "IN_PERSON" ? "대면" : "대면·비대면 모두"}</p></div><CopyRoomLink room={room} /></section>;
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
      const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === room.invite_code && ["candidates", "unapplied", "result"].includes(String(query.queryKey[0])) };
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

function RoomHistoryNotice({ room }: { room: Room }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const recent = useRecentRooms();
  const { invite_code, purpose, viewer: { joined } } = room;
  useEffect(() => { setSaved(rememberRoom({ invite_code, purpose, viewer: { joined } })); }, [invite_code, purpose, joined]);
  return <p className={`room-history-note ${saved === false ? "alert warning" : ""}`} role="status">
    {saved === false ? "이 브라우저에 모임 주소를 보관하지 못했어요. 초대 링크를 복사하거나 북마크해 주세요." : recent.rooms.some(item => item.inviteCode === invite_code) ? <>홈의 <Link to="/">이 기기의 최근 모임</Link>에서 다시 열 수 있어요. 초대 링크도 복사하거나 북마크해 보관해 주세요.</> : "초대 링크를 복사하거나 북마크해 보관해 주세요."}
    {" "}주최자 기능은 모임을 만든 브라우저에서 사용할 수 있어요. 시크릿 모드 종료·데이터 삭제·만료·다른 기기에서는 기존 참여 권한이 이어지지 않을 수 있어요.
  </p>;
}

function JoinRoom({ room, onJoined, previouslySaved }: { room: Room; onJoined: (room: Room) => void; previouslySaved: boolean }) {
  const [name, setName] = useState("");
  const mutation = useMutation({ mutationFn: () => api.joinRoom(room.invite_code, name.trim()), onSuccess: joinedRoom => { rememberRoom(joinedRoom); onJoined(joinedRoom); } });
  return <div className="form-page page-width narrow"><div className="glass-card join-card"><div className="large-icon"><Users /></div><span className="eyebrow subtle">초대받은 모임</span><h1>{room.purpose}</h1>{previouslySaved && <p className="previous-participation">이 브라우저의 이전 참여 정보를 확인하지 못했어요. 참여했던 브라우저에서 다시 열어 주세요. 같은 이름으로 새로 참여해도 기존 주최자 권한이나 입력은 복구되지 않아요.</p>}<p>참여할 이름을 입력해 주세요. 다른 참여자에게 표시되는 이름이에요.</p><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) mutation.mutate(); }}><label className="field"><span>내 이름</span><input autoFocus maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 지수" /></label>{mutation.isError && <div className="alert error">{errorMessage(mutation.error)}</div>}<button className="button primary wide" disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? "참여 중…" : "모임 참여하기"}</button></form><p className="privacy-note"><LockKeyhole size={15} /> 내 입력은 후보가 나오기 전까지 다른 사람에게 공개되지 않아요.</p></div></div>;
}

function SubmissionPanel({ room, onRoomChanged, onAccessDenied, draft, onDraftChanged }: { room: Room; onRoomChanged: (room: Room) => void; onAccessDenied: (error: ApiError) => void; draft: string | null; onDraftChanged: (room: Room, rawText: string | null) => void }) {
  const correcting = correctionOpen(room);
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState(draft ?? "");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [savedRawText, setSavedRawText] = useState("");
  const [editing, setEditing] = useState(false);
  const latestInput = useRef("");
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
  const refreshRoom = useMutation({ mutationKey: ["room", room.invite_code], mutationFn: () => api.getRoom(room.invite_code), onSuccess: refreshed => { if (mounted.current) onRoomChanged(refreshed); }, onError: error => { if (mounted.current && error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error); } });
  const save = useMutation({
    mutationKey: ownSubmissionKey(room),
    mutationFn: (text: string) => api.saveSubmission(room.invite_code, { raw_text: text, ...(correcting ? { revision_round_id: room.revision_round!.id, expected_revision: loadedRevision! } : {}) }),
    onSuccess: (submission, submittedText) => {
      if (!mounted.current) return;
      const previous = queryClient.getQueryData<Submission>(ownSubmissionKey(room));
      if (previous && previous.revision > submission.revision) return;
      setRawText(current => submissionText(current).text === submittedText ? submission.raw_text : current);
      setSavedRawText(submission.raw_text);
      setLoadedRevision(submission.revision);
      queryClient.setQueryData(ownSubmissionKey(room), submission);
      setEditing(latestInput.current !== submittedText);
      refreshRoom.mutate();
    },
  });
  const close = useMutation({
    mutationKey: ["room", room.invite_code],
    mutationFn: (confirmEarly: boolean) => api.closeRoom(room.invite_code, confirmEarly),
    onSuccess: refreshed => { if (mounted.current) onRoomChanged(refreshed); },
    onError: (error) => {
      if (!mounted.current) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onAccessDenied(error); return; }
      if (error instanceof ApiError && error.problem.code === "EARLY_CLOSE_CONFIRMATION_REQUIRED") {
        const submitted = error.problem.submitted_participants ?? "현재";
        const expected = error.problem.expected_participants ? ` / 목표 ${error.problem.expected_participants}명` : "";
        const deadline = error.problem.submission_deadline ? `\n마감: ${formatDateTime(error.problem.submission_deadline)}` : "";
        if (window.confirm(`${submitted}명 제출${expected}${deadline}\n아직 자동 마감 조건 전입니다. 지금 마감할까요?`)) close.mutate(true);
      }
    },
  });
  useEffect(() => {
    for (const error of [submissionQuery.error, save.error]) if (error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error);
    if (save.error instanceof ApiError && save.error.status === 409) { void queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); void queryClient.invalidateQueries({ queryKey: ["submission", room.invite_code] }); }
  }, [submissionQuery.error, save.error, onAccessDenied, queryClient, room.invite_code]);
  const { text, length, valid } = submissionText(rawText);
  const dirty = text !== savedRawText;
  useEffect(() => { if (loadedRevision !== null) onDraftChanged(room, dirty ? rawText : null); }, [room, rawText, dirty, loadedRevision, onDraftChanged]);
  const legacyManualOnly = submissionQuery.data?.raw_text === null;

  const completed = !!submissionQuery.data?.raw_text && !editing && !dirty;
  const host = room.viewer.role === "HOST";

  return <div className="submission-layout"><section className={"glass-card submission-card " + (completed ? "submission-complete" : "")}>
    {completed ? <>
      <div className="section-heading"><span className="eyebrow success"><CheckCircle2 size={15} /> 제출 완료</span><h2>조건 제출을 완료했어요</h2><p>조건이 안전하게 저장됐어요.</p></div>
      {!correcting && <div className="submission-next"><h3>{host ? "초대 링크를 공유해 주세요" : "입력 마감을 기다려 주세요"}</h3><p>{host ? "참여자에게 링크를 보내 조건을 모아 주세요. 입력이 마감되면 분석을 시작해요." : "입력이 마감되면 분석을 시작해요. 진행 상태는 자동으로 갱신돼요."}</p>{host && <CopyRoomLink room={room} primary />}</div>}
      <div className="submitted-condition"><span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span><p className="submitted-text">{submissionQuery.data?.raw_text}</p><button className="button secondary" disabled={submissionQuery.data?.editable === false || (correcting && !room.capabilities?.can_edit_own_submission) || save.isPending} onClick={() => { save.reset(); setEditing(true); }}>내 조건 수정</button></div>
    </> : <>
      <div className="section-heading"><span className="eyebrow subtle"><LockKeyhole size={14} /> 비공개로 모으는 조건</span><h2>{loadedRevision ? "내 조건을 수정해 주세요" : "가능한 조건을 알려주세요"}</h2><p>가능한 시간과 장소 조건을 자연어로 입력해 주세요.</p></div>
      <p id="submission-privacy" className="submission-privacy">반영된 조건은 다른 참여자에게 공개되지 않아요. 분석에 반영하지 못한 원문은 주최자에게 공개될 수 있어요.</p>
      {submissionQuery.isPending ? <div className="inline-loading"><LoaderCircle className="spin" /> 기존 입력 확인 중…</div> : submissionQuery.isError ? <div className="alert error">{errorMessage(submissionQuery.error)}</div> : <>
        {legacyManualOnly && <div className="alert warning" role="status">기존 시간표 입력은 보존되어 있어요. 가능한 시간을 자연어로 다시 입력하고 저장해 주세요.</div>}
        <label className="field"><span>시간·장소 조건 <small>필수</small></span><textarea autoFocus={editing} aria-describedby="submission-count submission-hint submission-privacy" aria-invalid={length > SUBMISSION_TEXT_LIMIT} rows={4} value={rawText} onChange={(event) => { latestInput.current = submissionText(event.target.value).text; setRawText(event.target.value); }} placeholder="예: 화요일과 목요일 저녁, 봉천역 근처면 좋아요. 비대면도 가능해요." /><small id="submission-count" className={"character-count " + (length > SUBMISSION_TEXT_LIMIT ? "field-error" : "")}>{length}/{SUBMISSION_TEXT_LIMIT}</small></label>
        <p id="submission-hint" className="field-hint">앞뒤 공백을 제외하고 1~500자로 입력해 주세요.</p>
        <div className="submission-footer"><div>{loadedRevision ? <span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span> : <span className="field-hint">조건은 마감 전까지 수정할 수 있어요.</span>}</div><div className="submission-actions">{editing && <button className="button secondary" disabled={save.isPending} onClick={() => { setRawText(submissionQuery.data?.raw_text ?? ""); save.reset(); setEditing(false); }}>수정 취소</button>}<button className="button primary" onClick={() => { latestInput.current = text; save.mutate(text); }} disabled={!valid || !dirty || save.isPending || submissionQuery.data?.editable === false || (correcting && !room.capabilities?.can_edit_own_submission)}>{save.isPending ? "저장 중…" : loadedRevision ? "수정 내용 저장" : "조건 제출하기"}</button></div></div>
      </>}
    </>}
    {!completed && dirty && loadedRevision !== null && <div className="alert warning" role="status">수정한 내용이 아직 저장되지 않았어요.</div>}
    {!completed && loadedRevision !== null && !dirty && !legacyManualOnly && <div className="alert success" role="status">조건이 안전하게 저장됐어요.</div>}
    <p className="submission-privacy">{correcting ? "저장은 분석 완료를 뜻하지 않아요. 주최자가 다시 분석하면 저장한 조건을 사용해요." : "저장은 분석 완료를 뜻하지 않아요. 입력 마감 후 조건을 분석해요."}</p>
    {refreshRoom.isError && <div className="alert warning refresh-warning" role="status"><span>조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.</span><button className="button secondary" onClick={() => refreshRoom.mutate()}>진행 상태 다시 확인</button></div>}
    {save.isError && <div className="alert error">{errorMessage(save.error)}</div>}
  </section><aside className="room-sidebar">{correcting ? <RecoveryActions room={room} onRoomChanged={onRoomChanged} onAccessDenied={onAccessDenied} blocked={dirty || save.isPending} /> : <><div className="glass-card side-card"><h3>마감 조건</h3>
    {room.manual_only ? <StatusLine icon={<Users />} label="마감 방식" value="주최자 직접 마감" /> : <>
      {room.expected_participants != null && <StatusLine icon={<Users />} label="자동 마감 목표 · 주최자 포함" value={"목표 " + room.expected_participants + "명 제출 시"} />}
      {room.submission_deadline && <StatusLine icon={<Clock3 />} label="자동 마감 시간" value={formatDateTime(room.submission_deadline)} />}
      {room.expected_participants != null && room.submission_deadline && <p className="closure-note">먼저 충족되는 조건에 따라 마감돼요.</p>}
    </>}
    <StatusLine icon={<Clock3 />} label="탐색 기간" value={formatDate(room.search_start_date) + " ~ " + formatDate(room.search_end_date) + " 전"} />
  </div>{host && <div className="glass-card side-card host-tools"><h3>주최자 도구</h3><p>필요한 입력이 모였다면 자동 조건 전에도 마감할 수 있어요.</p><button className="button danger-outline wide" onClick={() => close.mutate(false)} disabled={close.isPending}>{close.isPending ? "마감 중…" : "입력 마감하기"}</button>{close.isError && !(close.error instanceof ApiError && close.error.problem.code === "EARLY_CLOSE_CONFIRMATION_REQUIRED") && <div className="alert error">{errorMessage(close.error)}</div>}</div>}</>}</aside></div>;
}

function DelayedState({ room, onRetried, onAccessDenied }: { room: Room; onRetried: (room: Room) => void; onAccessDenied: (error: ApiError) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const retry = useMutation({ mutationKey: ["room", room.invite_code], mutationFn: () => api.retryAnalysis(room.invite_code), onSuccess: refreshed => { if (mounted.current) onRetried(refreshed); }, onError: error => { if (mounted.current && error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error); } });
  return <StateCard icon={<TriangleAlert />} title="분석이 잠시 지연되고 있어요" body="모두의 입력은 안전하게 저장되어 있어 다시 제출할 필요가 없어요." action={room.viewer.role === "HOST" ? <button className="button primary" onClick={() => retry.mutate()} disabled={retry.isPending}><RefreshCw size={17} /> {retry.isPending ? "요청 중…" : "분석 다시 요청"}</button> : undefined} error={retry.isError ? errorMessage(retry.error) : undefined} />;
}

function CandidatesPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
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
    <div className="candidate-list">{candidates.data.candidates.map((candidate) => <CandidateCard key={candidate.candidate_id} candidate={candidate} canConfirm={room.viewer.role === "HOST" && (!room.capabilities || room.capabilities.can_confirm)} pending={confirm.isPending} selectionWarning={partial ? `${candidates.data.applied_submissions}/${candidates.data.total_submissions}개 입력 반영 · 일부 입력을 제외하고 만든 후보예요.` : undefined} onConfirm={() => { if (window.confirm(`Plan ${candidate.plan_type}을 선택할까요? 실제 모임 날짜·시간은 따로 정해 공지해 주세요.`)) confirm.mutate(candidate.candidate_id); }} />)}</div>
    {confirm.isError && <div className="alert error">{errorMessage(confirm.error)}</div>}
  </section>;
}

function UnappliedInputs({ room, count, onAccessDenied }: { room: Room; count?: number; onAccessDenied: (error: ApiError) => void }) {
  const unapplied = useQuery({ queryKey: ["unapplied", room.invite_code, room.analysis_id ?? "legacy"], queryFn: () => api.getUnappliedInputs(room.invite_code), enabled: room.viewer.role === "HOST" });
  useEffect(() => { if (unapplied.error instanceof ApiError && [401, 403, 404].includes(unapplied.error.status)) onAccessDenied(unapplied.error); }, [unapplied.error, onAccessDenied]);
  return <details className="unapplied glass-card"><summary>반영되지 않은 입력{count === undefined ? "" : ` ${count}개`} 확인</summary>{unapplied.isPending ? <p>불러오는 중…</p> : unapplied.isError ? <div className="alert error">{errorMessage(unapplied.error)}<button className="button secondary" onClick={() => unapplied.refetch()}>다시 시도</button></div> : unapplied.data.length === 0 ? <p>반영되지 않은 입력이 없어요.</p> : unapplied.data.map((item, index) => <article key={index}><strong>{item.participant_display_name}</strong><p>{item.raw_text ?? "기존 시간표만 제출되어 자연어 원문이 없어요."}</p><small>{Object.hasOwn(UNAPPLIED_REASON_MESSAGES, item.reason) ? UNAPPLIED_REASON_MESSAGES[item.reason] : item.reason}</small></article>)}</details>;
}

function ResultPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  const result = useQuery({ queryKey: ["result", room.invite_code], queryFn: () => api.getResult(room.invite_code) });
  useEffect(() => { if (result.error instanceof ApiError && [401, 403, 404].includes(result.error.status)) onAccessDenied(result.error); }, [result.error, onAccessDenied]);
  if (result.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="선택한 플랜을 불러오는 중이에요" />;
  if (result.isError) return <StateCard icon={<AlertCircle />} title="결과를 불러오지 못했어요" body={errorMessage(result.error)} />;
  return <section className="results-section"><div className="section-heading centered"><span className="eyebrow success"><CheckCircle2 size={15} /> 플랜 선택 완료</span><h2>주최자가 선택한 플랜이에요</h2><p>{formatDateTime(result.data.confirmed_at)}에 주최자가 Plan {result.data.candidate.plan_type}을 선택했어요.</p></div><div className="candidate-list single"><CandidateCard candidate={result.data.candidate} canConfirm={false} confirmed /></div><CopyRoomLink room={room} result /></section>;
}

function StateCard({ icon, title, body, action, error }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode; error?: string }) { return <div className="center-state glass-card"><div className="large-icon">{icon}</div><h1>{title}</h1>{body && <p>{body}</p>}{error && <div className="alert error">{error}</div>}{action}<Link className="text-link" to="/">새 모임 만들기</Link></div>; }
function StatusLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="status-line"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }
