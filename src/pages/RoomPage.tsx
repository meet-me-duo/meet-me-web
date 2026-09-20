import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Sparkles, TriangleAlert, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, errorMessage } from "../api/client";
import type { ManualAvailability, Room, Submission } from "../api/types";
import { CandidateCard } from "../components/CandidateCard";
import { TimeGrid } from "../components/TimeGrid";
import { formatDate, formatDateTime } from "../utils/time";

export default function RoomPage() {
  const { inviteCode = "" } = useParams();
  const queryClient = useQueryClient();
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

  if (!room.viewer.joined) return room.public_status === "COLLECTING" ? <JoinRoom room={room} onJoined={setRoom} /> : <StateCard icon={<LockKeyhole />} title="입력이 마감된 모임이에요" body="이 브라우저에서 마감 전에 참여한 사람만 결과를 확인할 수 있어요." />;

  return (
    <div className="room-page page-width">
      <RoomHeader room={room} />
      {room.public_status === "COLLECTING" && <SubmissionPanel room={room} onRoomChanged={setRoom} />}
      {room.public_status === "ANALYZING" && <StateCard icon={<LoaderCircle className="spin" />} title="모두의 조건을 분석하고 있어요" body="입력은 안전하게 저장됐어요. 최적의 플랜을 만드는 데 잠시 시간이 걸릴 수 있어요." />}
      {room.public_status === "INSUFFICIENT_PARTICIPANTS" && <StateCard icon={<Users />} title="조율에 필요한 인원이 부족해요" body="최소 두 명의 제출이 필요해 후보를 만들지 않았어요." />}
      {room.public_status === "ANALYSIS_DELAYED" && <DelayedState room={room} onRetried={setRoom} />}
      {room.public_status === "NO_MATCH" && <StateCard icon={<AlertCircle />} title="모두에게 맞는 후보를 찾지 못했어요" body="입력은 정상적으로 분석됐지만 겹치는 조건이 없었어요. 다음 모임에서는 탐색 기간이나 조건을 조금 넓혀 보세요." />}
      {(room.public_status === "READY" || room.public_status === "READY_WITH_WARNINGS") && <CandidatesPanel room={room} />}
      {room.public_status === "CONFIRMED" && <ResultPanel room={room} />}
    </div>
  );
}

function RoomHeader({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}/rooms/${room.invite_code}`;
  const copy = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1_800); } catch { window.prompt("아래 링크를 복사해 주세요.", inviteUrl); } };
  return <section className="room-header glass-card"><div><span className="room-kicker">{room.viewer.role === "HOST" ? "내가 만든 모임" : `${room.viewer.display_name}님이 참여한 모임`}</span><h1>{room.purpose}</h1><p>{formatDate(room.search_start_date)}부터 {formatDate(room.search_end_date)} 전까지 · {room.meeting_mode === "REMOTE" ? "비대면" : room.meeting_mode === "IN_PERSON" ? "대면" : "대면·비대면 모두"}</p></div><button className="button secondary" onClick={copy}>{copied ? <CheckCircle2 size={18} /> : <Share2 size={18} />}{copied ? "복사됨" : "초대 링크 복사"}</button></section>;
}

function JoinRoom({ room, onJoined }: { room: Room; onJoined: (room: Room) => void }) {
  const [name, setName] = useState("");
  const mutation = useMutation({ mutationFn: () => api.joinRoom(room.invite_code, name.trim()), onSuccess: onJoined });
  return <div className="form-page page-width narrow"><div className="glass-card join-card"><div className="large-icon"><Users /></div><span className="eyebrow subtle">초대받은 모임</span><h1>{room.purpose}</h1><p>참여할 이름을 입력해 주세요. 다른 참여자에게 표시되는 이름이에요.</p><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) mutation.mutate(); }}><label className="field"><span>내 이름</span><input autoFocus maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 지수" /></label>{mutation.isError && <div className="alert error">{errorMessage(mutation.error)}</div>}<button className="button primary wide" disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? "참여 중…" : "모임 참여하기"}</button></form><p className="privacy-note"><LockKeyhole size={15} /> 내 입력은 후보가 나오기 전까지 다른 사람에게 공개되지 않아요.</p></div></div>;
}

function SubmissionPanel({ room, onRoomChanged }: { room: Room; onRoomChanged: (room: Room) => void }) {
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [availability, setAvailability] = useState<ManualAvailability[]>([]);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const submissionQuery = useQuery<Submission | null>({
    queryKey: ["submission", room.invite_code],
    queryFn: async () => { try { return await api.getSubmission(room.invite_code); } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; } },
  });
  useEffect(() => {
    if (submissionQuery.data && submissionQuery.data.revision !== loadedRevision) {
      setRawText(submissionQuery.data.raw_text ?? "");
      setAvailability(submissionQuery.data.manual_available_times);
      setLoadedRevision(submissionQuery.data.revision);
    }
  }, [submissionQuery.data, loadedRevision]);
  const save = useMutation({
    mutationFn: () => api.saveSubmission(room.invite_code, { raw_text: rawText.trim() || null, manual_available_times: availability }),
    onSuccess: async (submission) => { queryClient.setQueryData(["submission", room.invite_code], submission); setLoadedRevision(submission.revision); const latest = await api.getRoom(room.invite_code); onRoomChanged(latest); },
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
  const valid = Boolean(rawText.trim()) || availability.length > 0;

  return <div className="submission-layout"><section className="glass-card submission-card"><div className="section-heading"><span className="eyebrow subtle"><LockKeyhole size={14} /> 나만 볼 수 있는 입력</span><h2>{loadedRevision ? "내 조건을 수정해 주세요" : "가능한 조건을 알려주세요"}</h2><p>자연어 또는 시간표 중 편한 방법 하나만 사용해도 괜찮아요.</p></div>{submissionQuery.isPending ? <div className="inline-loading"><LoaderCircle className="spin" /> 기존 입력 확인 중…</div> : submissionQuery.isError ? <div className="alert error">{errorMessage(submissionQuery.error)}</div> : <><label className="field"><span>시간·장소 조건 <small>선택</small></span><textarea maxLength={500} rows={4} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="예: 화요일과 목요일 저녁, 봉천역 근처면 좋아요. 비대면도 가능해요." /><small className="character-count">{Array.from(rawText).length}/500</small></label><TimeGrid room={room} value={availability} onChange={setAvailability} /><div className="submission-footer"><div>{loadedRevision ? <span className="saved-revision"><CheckCircle2 size={16} /> 저장된 입력 #{loadedRevision}</span> : <span className="field-hint">조건은 마감 전까지 수정할 수 있어요.</span>}</div><button className="button primary" onClick={() => save.mutate()} disabled={!valid || save.isPending}>{save.isPending ? "저장 중…" : loadedRevision ? "수정 내용 저장" : "조건 제출하기"}</button></div>{save.isError && <div className="alert error">{errorMessage(save.error)}</div>}{save.isSuccess && <div className="alert success" role="status">조건이 안전하게 저장됐어요.</div>}</>}</section><aside className="room-sidebar"><div className="glass-card side-card"><h3>진행 상황</h3><StatusLine icon={<Users />} label="마감 조건" value={room.expected_participants ? `${room.expected_participants}명 제출` : room.submission_deadline ? formatDateTime(room.submission_deadline) : "주최자 수동 마감"} /><StatusLine icon={<Clock3 />} label="탐색 기간" value={`${formatDate(room.search_start_date)} ~ ${formatDate(room.search_end_date)} 전`} /></div>{room.viewer.role === "HOST" && <div className="glass-card side-card host-tools"><h3>주최자 도구</h3><p>필요한 입력이 모였다면 자동 조건 전에도 마감할 수 있어요.</p><button className="button danger-outline wide" onClick={() => close.mutate(false)} disabled={close.isPending}>{close.isPending ? "마감 중…" : "입력 마감하기"}</button>{close.isError && !(close.error instanceof ApiError && close.error.problem.code === "EARLY_CLOSE_CONFIRMATION_REQUIRED") && <div className="alert error">{errorMessage(close.error)}</div>}</div>}</aside></div>;
}

function DelayedState({ room, onRetried }: { room: Room; onRetried: (room: Room) => void }) {
  const retry = useMutation({ mutationFn: () => api.retryAnalysis(room.invite_code), onSuccess: onRetried });
  return <StateCard icon={<TriangleAlert />} title="분석이 잠시 지연되고 있어요" body="모두의 입력은 안전하게 저장되어 있어 다시 제출할 필요가 없어요." action={room.viewer.role === "HOST" ? <button className="button primary" onClick={() => retry.mutate()} disabled={retry.isPending}><RefreshCw size={17} /> {retry.isPending ? "요청 중…" : "분석 다시 요청"}</button> : undefined} error={retry.isError ? errorMessage(retry.error) : undefined} />;
}

function CandidatesPanel({ room }: { room: Room }) {
  const queryClient = useQueryClient();
  const candidates = useQuery({ queryKey: ["candidates", room.invite_code], queryFn: () => api.getCandidates(room.invite_code) });
  const unapplied = useQuery({ queryKey: ["unapplied", room.invite_code], queryFn: () => api.getUnappliedInputs(room.invite_code), enabled: room.public_status === "READY_WITH_WARNINGS" && room.viewer.role === "HOST" });
  const confirm = useMutation({ mutationFn: (id: string) => api.confirmCandidate(room.invite_code, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }), onError: (error) => { if (error instanceof ApiError && error.problem.code === "CANDIDATE_ALREADY_CONFIRMED") queryClient.invalidateQueries({ queryKey: ["room", room.invite_code] }); } });
  if (candidates.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="후보를 불러오고 있어요" />;
  if (candidates.isError) return <StateCard icon={<AlertCircle />} title="후보를 불러오지 못했어요" body={errorMessage(candidates.error)} action={<button className="button secondary" onClick={() => candidates.refetch()}>다시 시도</button>} />;
  return <section className="results-section"><div className="section-heading centered"><span className="eyebrow subtle"><Sparkles size={15} /> 스마트 조율 완료</span><h2>모두에게 가장 좋은 플랜이에요</h2><p>서버가 계산한 우선순위대로 보여드려요. {room.viewer.role === "HOST" ? "하나를 골라 확정해 주세요." : "주최자가 최종 플랜을 고르는 중이에요."}</p></div>{candidates.data.quality === "PARTIAL" && <div className="alert warning"><TriangleAlert size={18} /> 일부 자연어 조건을 해석하지 못해 가능한 입력만으로 만든 결과예요. ({candidates.data.applied_submissions}/{candidates.data.total_submissions}개 반영)</div>}<div className="candidate-list">{candidates.data.candidates.map((candidate) => <CandidateCard key={candidate.candidate_id} candidate={candidate} canConfirm={room.viewer.role === "HOST"} pending={confirm.isPending} onConfirm={() => { if (window.confirm(`Plan ${candidate.plan_type}을 최종 일정으로 확정할까요?`)) confirm.mutate(candidate.candidate_id); }} />)}</div>{confirm.isError && <div className="alert error">{errorMessage(confirm.error)}</div>}{room.public_status === "READY_WITH_WARNINGS" && room.viewer.role === "HOST" && <details className="unapplied glass-card"><summary>반영되지 않은 입력 {candidates.data.unapplied_inputs}개 확인</summary>{unapplied.isPending ? <p>불러오는 중…</p> : unapplied.data?.map((item) => <article key={`${item.participant_display_name}-${item.raw_text}`}><strong>{item.participant_display_name}</strong><p>{item.raw_text}</p><small>{item.reason}</small></article>)}</details>}</section>;
}

function ResultPanel({ room }: { room: Room }) {
  const result = useQuery({ queryKey: ["result", room.invite_code], queryFn: () => api.getResult(room.invite_code) });
  if (result.isPending) return <StateCard icon={<LoaderCircle className="spin" />} title="확정 결과를 불러오는 중이에요" />;
  if (result.isError) return <StateCard icon={<AlertCircle />} title="결과를 불러오지 못했어요" body={errorMessage(result.error)} />;
  return <section className="results-section"><div className="section-heading centered"><span className="eyebrow success"><CheckCircle2 size={15} /> 일정 확정</span><h2>우리의 만남이 정해졌어요!</h2><p>{formatDateTime(result.data.confirmed_at)}에 주최자가 확정했어요.</p></div><div className="candidate-list single"><CandidateCard candidate={result.data.candidate} canConfirm={false} confirmed /></div><button className="button secondary result-copy" onClick={() => navigator.clipboard.writeText(window.location.href)}><Copy size={17} /> 결과 링크 복사</button></section>;
}

function StateCard({ icon, title, body, action, error }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode; error?: string }) { return <div className="center-state glass-card"><div className="large-icon">{icon}</div><h1>{title}</h1>{body && <p>{body}</p>}{error && <div className="alert error">{error}</div>}{action}<Link className="text-link" to="/">새 모임 만들기</Link></div>; }
function StatusLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="status-line"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }
