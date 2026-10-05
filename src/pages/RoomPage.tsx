import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Sparkles, TriangleAlert, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, errorMessage } from "../api/client";
import type { Room, Submission } from "../api/types";
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
  const roomQuery = useQuery({
    queryKey: ["room", inviteCode],
    queryFn: ({ signal }) => api.getRoom(inviteCode, signal),
    enabled: /^[A-Za-z0-9_-]{22}$/.test(inviteCode),
    refetchInterval: (query) => query.state.data?.public_status === "ANALYZING" ? 2_000 : query.state.data?.public_status === "COLLECTING" ? 5_000 : false,
  });
  const setRoom = (room: Room) => queryClient.setQueryData(["room", inviteCode], room);

  if (!/^[A-Za-z0-9_-]{22}$/.test(inviteCode)) return <StateCard icon={<AlertCircle />} title="초대 링크가 올바르지 않아요" body="받은 링크 전체를 다시 확인해 주세요." />;
  if (roomQuery.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="모임을 불러오는 중이에요" />;
  if (roomQuery.isError) return <StateCard icon={<AlertCircle />} title="모임을 불러오지 못했어요" body={errorMessage(roomQuery.error)} action={<button className="button secondary" onClick={() => roomQuery.refetch()}>다시 시도</button>} />;
  const room = roomQuery.data;

  if (!room.viewer.joined) return room.public_status === "COLLECTING" ? <JoinRoom room={room} onJoined={setRoom} previouslySaved={recent.rooms.some(item => item.inviteCode === inviteCode)} /> : <StateCard icon={<LockKeyhole />} title="입력이 마감된 모임이에요" body="참여했던 브라우저에서 다시 열어 주세요. 참여 정보가 삭제되거나 만료되면 보관한 링크만으로 기존 권한이나 결과를 복구할 수 없어요." />;

  return (
    <div className="room-page page-width">
      <RoomHeader room={room} />
      <RoomHistoryNotice room={room} />
      {room.public_status === "COLLECTING" && <SubmissionPanel room={room} onRoomChanged={setRoom} />}
      {room.public_status === "ANALYZING" && <StateCard icon={<LoaderCircle className="spin" />} title="모두의 조건을 분석하고 있어요" body="입력은 안전하게 저장됐어요. 최적의 플랜을 만드는 데 잠시 시간이 걸릴 수 있어요." />}
      {room.public_status === "INSUFFICIENT_PARTICIPANTS" && <StateCard icon={<Users />} title="조율에 필요한 인원이 부족해요" body="최소 두 명의 제출이 필요해 후보를 만들지 않았어요." />}
      {room.public_status === "ANALYSIS_DELAYED" && <DelayedState room={room} onRetried={setRoom} />}
      {room.public_status === "NO_MATCH" && <><StateCard icon={<AlertCircle />} title="모두에게 맞는 후보를 찾지 못했어요" body="반영 가능한 조건에서 함께할 일정을 찾지 못했어요. 일부 입력은 반영되지 않았을 수 있어요. 다음 모임에서는 탐색 기간이나 조건을 조정해 보세요." />{room.viewer.role === "HOST" && <UnappliedInputs room={room} />}</>}
      {(room.public_status === "READY" || room.public_status === "READY_WITH_WARNINGS") && <CandidatesPanel room={room} />}
      {room.public_status === "CONFIRMED" && <ResultPanel room={room} />}
    </div>
  );
}

function RoomHeader({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = roomLink(room.invite_code);
  const copy = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1_800); } catch { window.prompt("아래 링크를 복사해 주세요.", inviteUrl); } };
  return <section className="room-header glass-card"><div><span className="room-kicker">{room.viewer.role === "HOST" ? "내가 만든 모임" : `${room.viewer.display_name}님이 참여한 모임`}</span><h1>{room.purpose}</h1><p>{formatDate(room.search_start_date)}부터 {formatDate(room.search_end_date)} 전까지 · {room.meeting_mode === "REMOTE" ? "비대면" : room.meeting_mode === "IN_PERSON" ? "대면" : "대면·비대면 모두"}</p></div><button className="button secondary" onClick={copy}>{copied ? <CheckCircle2 size={18} /> : <Share2 size={18} />}{copied ? "복사됨" : "초대 링크 복사"}</button></section>;
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

function SubmissionPanel({ room, onRoomChanged }: { room: Room; onRoomChanged: (room: Room) => void }) {
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [savedRawText, setSavedRawText] = useState("");
  const submissionQuery = useQuery<Submission | null>({
    queryKey: ["submission", room.invite_code],
    queryFn: async () => { try { return await api.getSubmission(room.invite_code); } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; } },
  });
  useEffect(() => {
    if (submissionQuery.data && submissionQuery.data.revision !== loadedRevision) {
      const receivedText = submissionQuery.data.raw_text ?? "";
      setRawText(current => loadedRevision === null || submissionText(current).text === savedRawText ? receivedText : current);
      setSavedRawText(receivedText);
      setLoadedRevision(submissionQuery.data.revision);
    }
  }, [submissionQuery.data, loadedRevision, savedRawText]);
  const refreshRoom = useMutation({ mutationFn: () => api.getRoom(room.invite_code), onSuccess: onRoomChanged });
  const save = useMutation({
    mutationFn: (text: string) => api.saveSubmission(room.invite_code, { raw_text: text }),
    onSuccess: (submission, submittedText) => {
      setRawText(current => submissionText(current).text === submittedText ? submission.raw_text : current);
      setSavedRawText(submission.raw_text);
      setLoadedRevision(submission.revision);
      queryClient.setQueryData(["submission", room.invite_code], submission);
      refreshRoom.mutate();
    },
  });
  const close = useMutation({
    mutationFn: (confirmEarly: boolean) => api.closeRoom(room.invite_code, confirmEarly),
    onSuccess: onRoomChanged,
    onError: (error) => {
      if (error instanceof ApiError && error.problem.code === "EARLY_CLOSE_CONFIRMATION_REQUIRED") {
        const submitted = error.problem.submitted_participants ?? "현재";
        const expected = error.problem.expected_participants ? ` / 목표 ${error.problem.expected_participants}명` : "";
        const deadline = error.problem.submission_deadline ? `\n마감: ${formatDateTime(error.problem.submission_deadline)}` : "";
        if (window.confirm(`${submitted}명 제출${expected}${deadline}\n아직 자동 마감 조건 전입니다. 지금 마감할까요?`)) close.mutate(true);
      }
    },
  });
  const { text, length, valid } = submissionText(rawText);
  const dirty = text !== savedRawText;
  const legacyManualOnly = submissionQuery.data?.raw_text === null;

  return <div className="submission-layout"><section className="glass-card submission-card">
    <div className="section-heading"><span className="eyebrow subtle"><LockKeyhole size={14} /> 비공개로 모으는 조건</span><h2>{loadedRevision ? "내 조건을 수정해 주세요" : "가능한 조건을 알려주세요"}</h2><p>가능한 시간과 장소 조건을 자연어로 입력해 주세요.</p></div>
    <p id="submission-privacy" className="submission-privacy">반영된 조건은 다른 참여자에게 공개되지 않아요. 분석에 반영하지 못한 원문은 주최자에게 공개될 수 있어요.</p>
    {submissionQuery.isPending ? <div className="inline-loading"><LoaderCircle className="spin" /> 기존 입력 확인 중…</div> : submissionQuery.isError ? <div className="alert error">{errorMessage(submissionQuery.error)}</div> : <>
      {legacyManualOnly && <div className="alert warning" role="status">기존 시간표 입력은 보존되어 있어요. 가능한 시간을 자연어로 다시 입력하고 저장해 주세요.</div>}
      <label className="field"><span>시간·장소 조건 <small>필수</small></span><textarea aria-describedby="submission-count submission-hint submission-privacy" aria-invalid={length > SUBMISSION_TEXT_LIMIT} rows={4} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="예: 화요일과 목요일 저녁, 봉천역 근처면 좋아요. 비대면도 가능해요." /><small id="submission-count" className={`character-count ${length > SUBMISSION_TEXT_LIMIT ? "field-error" : ""}`}>{length}/{SUBMISSION_TEXT_LIMIT}</small></label>
      <p id="submission-hint" className="field-hint">앞뒤 공백을 제외하고 1~500자로 입력해 주세요.</p>
      <div className="submission-footer"><div>{loadedRevision ? <span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span> : <span className="field-hint">조건은 마감 전까지 수정할 수 있어요.</span>}</div><button className="button primary" onClick={() => save.mutate(text)} disabled={!valid || !dirty || save.isPending || submissionQuery.data?.editable === false}>{save.isPending ? "저장 중…" : loadedRevision ? "수정 내용 저장" : "조건 제출하기"}</button></div>
      {dirty && loadedRevision !== null && <div className="alert warning" role="status">수정한 내용이 아직 저장되지 않았어요.</div>}
      {save.isError && <div className="alert error">{errorMessage(save.error)}</div>}
      {loadedRevision !== null && !dirty && !legacyManualOnly && <div className="alert success" role="status">조건이 안전하게 저장됐어요.</div>}
      <p className="submission-privacy">저장은 분석 완료를 뜻하지 않아요. 입력 마감 후 조건을 분석해요.</p>
      {refreshRoom.isError && <div className="alert warning refresh-warning" role="status"><span>조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.</span><button className="button secondary" onClick={() => refreshRoom.mutate()}>진행 상태 다시 확인</button></div>}
    </>}
  </section><aside className="room-sidebar"><div className="glass-card side-card"><h3>진행 상황</h3><StatusLine icon={<Users />} label="마감 조건" value={room.expected_participants ? `${room.expected_participants}명 제출` : room.submission_deadline ? formatDateTime(room.submission_deadline) : "주최자 수동 마감"} /><StatusLine icon={<Clock3 />} label="탐색 기간" value={`${formatDate(room.search_start_date)} ~ ${formatDate(room.search_end_date)} 전`} /></div>{room.viewer.role === "HOST" && <div className="glass-card side-card host-tools"><h3>주최자 도구</h3><p>필요한 입력이 모였다면 자동 조건 전에도 마감할 수 있어요.</p><button className="button danger-outline wide" onClick={() => close.mutate(false)} disabled={close.isPending}>{close.isPending ? "마감 중…" : "입력 마감하기"}</button>{close.isError && !(close.error instanceof ApiError && close.error.problem.code === "EARLY_CLOSE_CONFIRMATION_REQUIRED") && <div className="alert error">{errorMessage(close.error)}</div>}</div>}</aside></div>;
}

function DelayedState({ room, onRetried }: { room: Room; onRetried: (room: Room) => void }) {
  const retry = useMutation({ mutationFn: () => api.retryAnalysis(room.invite_code), onSuccess: onRetried });
  return <StateCard icon={<TriangleAlert />} title="분석이 잠시 지연되고 있어요" body="모두의 입력은 안전하게 저장되어 있어 다시 제출할 필요가 없어요." action={room.viewer.role === "HOST" ? <button className="button primary" onClick={() => retry.mutate()} disabled={retry.isPending}><RefreshCw size={17} /> {retry.isPending ? "요청 중…" : "분석 다시 요청"}</button> : undefined} error={retry.isError ? errorMessage(retry.error) : undefined} />;
}

function CandidatesPanel({ room }: { room: Room }) {
  const queryClient = useQueryClient();
  const candidates = useQuery({ queryKey: ["candidates", room.invite_code], queryFn: () => api.getCandidates(room.invite_code) });
  const confirm = useMutation({ mutationFn: (id: string) => api.confirmCandidate(room.invite_code, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }), onError: (error) => { if (error instanceof ApiError && error.problem.code === "CANDIDATE_ALREADY_CONFIRMED") queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); } });
  if (candidates.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="후보를 불러오고 있어요" />;
  if (candidates.isError) return <StateCard icon={<AlertCircle />} title="후보를 불러오지 못했어요" body={errorMessage(candidates.error)} action={<button className="button secondary" onClick={() => candidates.refetch()}>다시 시도</button>} />;
  const partial = candidates.data.quality === "PARTIAL";
  const hasCandidates = candidates.data.candidates.length > 0;
  return <section className="results-section">
    <div className="section-heading centered"><span className="eyebrow subtle"><Sparkles size={15} /> 후보 계산 완료</span><h2>{!hasCandidates ? "선택할 수 있는 후보가 없어요" : partial ? "일부 조건으로 만든 후보 플랜이에요" : "함께할 수 있는 후보 플랜이에요"}</h2><p>{hasCandidates ? <>계산된 우선순위대로 보여드려요. {room.viewer.role === "HOST" ? "가능한 시간과 지역을 확인하고 플랜 하나를 선택해 주세요." : "주최자가 플랜을 선택하면 결과를 볼 수 있어요."}</> : "반영 가능한 조건에서 함께할 일정을 찾지 못했어요. 다음 모임에서는 탐색 기간이나 조건을 조정해 보세요."}</p></div>
    {partial && <div className="alert warning"><TriangleAlert size={18} /> 일부 입력이 반영되지 않아 반영 가능한 조건으로 만든 결과예요. ({candidates.data.applied_submissions}/{candidates.data.total_submissions}개 반영)</div>}
    {room.public_status === "READY_WITH_WARNINGS" && room.viewer.role === "HOST" && <UnappliedInputs room={room} count={candidates.data.unapplied_inputs} />}
    <div className="candidate-list">{candidates.data.candidates.map((candidate) => <CandidateCard key={candidate.candidate_id} candidate={candidate} canConfirm={room.viewer.role === "HOST"} pending={confirm.isPending} selectionWarning={partial ? `${candidates.data.applied_submissions}/${candidates.data.total_submissions}개 입력 반영 · 일부 입력을 제외하고 만든 후보예요.` : undefined} onConfirm={() => { if (window.confirm(`Plan ${candidate.plan_type}을 선택할까요? 실제 모임 날짜·시간은 따로 정해 공지해 주세요.`)) confirm.mutate(candidate.candidate_id); }} />)}</div>
    {confirm.isError && <div className="alert error">{errorMessage(confirm.error)}</div>}
  </section>;
}

function UnappliedInputs({ room, count }: { room: Room; count?: number }) {
  const unapplied = useQuery({ queryKey: ["unapplied", room.invite_code], queryFn: () => api.getUnappliedInputs(room.invite_code), enabled: room.viewer.role === "HOST" });
  return <details className="unapplied glass-card"><summary>반영되지 않은 입력{count === undefined ? "" : ` ${count}개`} 확인</summary>{unapplied.isPending ? <p>불러오는 중…</p> : unapplied.isError ? <div className="alert error">{errorMessage(unapplied.error)}<button className="button secondary" onClick={() => unapplied.refetch()}>다시 시도</button></div> : unapplied.data.length === 0 ? <p>반영되지 않은 입력이 없어요.</p> : unapplied.data.map((item, index) => <article key={index}><strong>{item.participant_display_name}</strong><p>{item.raw_text ?? "기존 시간표만 제출되어 자연어 원문이 없어요."}</p><small>{Object.hasOwn(UNAPPLIED_REASON_MESSAGES, item.reason) ? UNAPPLIED_REASON_MESSAGES[item.reason] : item.reason}</small></article>)}</details>;
}

function ResultPanel({ room }: { room: Room }) {
  const result = useQuery({ queryKey: ["result", room.invite_code], queryFn: () => api.getResult(room.invite_code) });
  if (result.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="선택한 플랜을 불러오는 중이에요" />;
  if (result.isError) return <StateCard icon={<AlertCircle />} title="결과를 불러오지 못했어요" body={errorMessage(result.error)} />;
  return <section className="results-section"><div className="section-heading centered"><span className="eyebrow success"><CheckCircle2 size={15} /> 플랜 선택 완료</span><h2>주최자가 선택한 플랜이에요</h2><p>{formatDateTime(result.data.confirmed_at)}에 주최자가 Plan {result.data.candidate.plan_type}을 선택했어요.</p></div><div className="candidate-list single"><CandidateCard candidate={result.data.candidate} canConfirm={false} confirmed /></div><button className="button secondary result-copy" onClick={() => navigator.clipboard.writeText(roomLink(room.invite_code)).catch(() => window.prompt("아래 링크를 복사해 주세요.", roomLink(room.invite_code)))}><Copy size={17} /> 결과 링크 복사</button></section>;
}

function StateCard({ icon, title, body, action, error }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode; error?: string }) { return <div className="center-state glass-card"><div className="large-icon">{icon}</div><h1>{title}</h1>{body && <p>{body}</p>}{error && <div className="alert error">{error}</div>}{action}<Link className="text-link" to="/">새 모임 만들기</Link></div>; }
function StatusLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="status-line"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }
