import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { OperationsError, operationsApi, operationsMessage, type OperationAnalyses, type OperationDiagnostics, type OperationReanalysisRequest, type OperationRoomDetail, type OperationRooms, type OperationsApi } from "../api/operations";
import { RoomSettings } from "./OperationsTechnicalDetails";
import { AnalysisOutcome, AnalysisTimeline, InputCards, Pill, StoredResults } from "./operations/DiagnosticViews";
import { ReanalysisDialog } from "./operations/ReanalysisDialog";
import { analysisStatus, canReanalyze, dateRange, modeLabel, roomStatus, stamp } from "./operations/presentation";
import "./OperationsPage.css";

type Target = { kind: "rooms"; cursor?: string } | { kind: "room"; id: string; analysisId?: string | null };
type Data = { kind: "rooms"; page: OperationRooms } | { kind: "room"; detail: OperationRoomDetail; history: OperationAnalyses; view: OperationDiagnostics };
type State = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: Data; api: OperationsApi; authRevision: number };
type Bound = { api: OperationsApi; authRevision: number };
type Pending = Bound & { roomId: string; body: OperationReanalysisRequest };
type Modal = Bound & { roomId: string; source: string; version: number; title: string; button: HTMLButtonElement };

export default function OperationsPage({ api = operationsApi, authRevision = 0 }: { api?: OperationsApi; authRevision?: number }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<Modal | null>(null);
  const [sending, setSending] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const binding = useRef<Bound>({ api, authRevision });
  binding.current = { api, authRevision };
  const active = useRef<{ controller: AbortController; key: string } | null>(null);
  const post = useRef<AbortController | null>(null);
  const pending = useRef<Pending | null>(null);
  const ambiguous = useRef(new Map<string, Pending>());
  const target = useRef<Target>({ kind: "rooms" });
  const listCursor = useRef<string | undefined>(undefined);
  const sequence = useRef(0);
  const current = state.phase === "ready" && state.api === api && state.authRevision === authRevision ? state.data : null;

  const load = useCallback(async (next: Target, quiet = false) => {
    const key = JSON.stringify(next);
    if (active.current?.key === key) return;
    active.current?.controller.abort();
    setHistoryBusy(false);
    const controller = new AbortController();
    const generation = ++sequence.current;
    active.current = { controller, key };
    target.current = next;
    if (!quiet) setState({ phase: "loading" });
    try {
      let data: Data;
      if (next.kind === "rooms") {
        const page = await api.rooms(next.cursor, controller.signal);
        listCursor.current = next.cursor;
        data = { kind: "rooms", page };
      } else {
        const [detail, history] = await Promise.all([api.room(next.id, undefined, controller.signal), api.analyses(next.id, undefined, controller.signal)]);
        if (detail.room.id !== next.id) throw new OperationsError(503);
        const selected = next.analysisId === undefined ? detail.room.collection_status === "COLLECTING" ? null : detail.room.active_analysis_id ?? null : next.analysisId;
        const view = await api.diagnostics(next.id, selected, controller.signal);
        if (view.room_id !== next.id || (selected === null ? view.scope !== "CURRENT_COLLECTION" || view.analysis !== null
          : view.scope !== "FROZEN_ANALYSIS" || view.analysis?.id !== selected)) throw new OperationsError(503);
        if (view.analysis && !history.items.some(item => item.id === view.analysis!.id)) history.items = [...history.items, view.analysis];
        data = { kind: "room", detail, history, view };
      }
      if (!controller.signal.aborted && generation === sequence.current && binding.current.api === api && binding.current.authRevision === authRevision) {
        const command = next.kind === "room" ? ambiguous.current.get(next.id) : undefined;
        pending.current = command ?? null;
        setPendingRetry(Boolean(command));
        setActionError(command ? "접수 여부를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요." : "");
        setState({ phase: "ready", data, api, authRevision });
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== sequence.current) return;
      controller.abort();
      if (error instanceof OperationsError && [401, 403, 404].includes(error.status)) {
        target.current = { kind: "rooms" }; pending.current = null; ambiguous.current.clear(); setPendingRetry(false); setModal(null); setNotice(""); setActionError("");
      }
      setState({ phase: "error", message: operationsMessage(error) });
    } finally {
      if (active.current?.controller === controller) active.current = null;
    }
  }, [api, authRevision]);

  useEffect(() => {
    pending.current = null; ambiguous.current.clear(); listCursor.current = undefined;
    setSearch(""); setFilter("all"); setModal(null); setNotice(""); setActionError(""); setPendingRetry(false); setSending(false); setHistoryBusy(false);
    void load({ kind: "rooms" });
    return () => { active.current?.controller.abort(); active.current = null; post.current?.abort(); post.current = null; pending.current = null; };
  }, [load]);
  useEffect(() => {
    if (current?.kind !== "room" || !current.view.analysis?.active || !["QUEUED", "STRUCTURING", "MATCHING"].includes(current.view.analysis.status)) return;
    const timer = setTimeout(() => { void load({ kind: "room", id: current.detail.room.id, analysisId: current.view.analysis!.id }, true); }, 4000);
    return () => clearTimeout(timer);
  }, [current, load]);

  const cancel = useCallback(() => setModal(null), []);
  async function sendPending() {
    const command = pending.current;
    if (!command || post.current || command.api !== api || command.authRevision !== authRevision) return;
    const controller = new AbortController(); post.current = controller;
    setSending(true); setActionError(""); setPendingRetry(false);
    try {
      const receipt = await api.reanalyze(command.roomId, command.body, controller.signal);
      if (controller.signal.aborted || binding.current.api !== api || binding.current.authRevision !== authRevision) return;
      pending.current = null; ambiguous.current.delete(command.roomId); setNotice("재분석 요청을 접수했어요. 새 분석 상태를 확인하고 있어요.");
      await load({ kind: "room", id: command.roomId, analysisId: receipt.analysis_id });
    } catch (error) {
      if (controller.signal.aborted || binding.current.api !== api || binding.current.authRevision !== authRevision) return;
      if (error instanceof OperationsError && [401, 403, 404].includes(error.status)) {
        pending.current = null; ambiguous.current.clear(); setModal(null); setState({ phase: "error", message: operationsMessage(error) });
      } else {
        const uncertain = !(error instanceof OperationsError) || error.status >= 500 || [408, 429].includes(error.status);
        if (!uncertain) { pending.current = null; ambiguous.current.delete(command.roomId); }
        else ambiguous.current.set(command.roomId, command);
        setPendingRetry(uncertain);
        setActionError(uncertain ? "접수 여부를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요." : operationsMessage(error));
      }
    } finally {
      if (post.current === controller) { post.current = null; setSending(false); }
    }
  }
  function confirm() {
    if (!modal || modal.api !== api || modal.authRevision !== authRevision || post.current) return;
    try {
      pending.current = { api, authRevision, roomId: modal.roomId, body: { request_id: crypto.randomUUID(), source_analysis_id: modal.source, expected_state_version: modal.version } };
      setModal(null); void sendPending();
    } catch { setModal(null); setActionError("요청을 준비하지 못했어요. 화면을 새로고침해 주세요."); }
  }
  async function moreHistory() {
    if (current?.kind !== "room" || !current.history.next_cursor || historyBusy) return;
    const before = current; const generation = sequence.current;
    const controller = new AbortController(); active.current?.controller.abort(); active.current = { controller, key: "history" };
    setHistoryBusy(true);
    try {
      const next = await api.analyses(before.detail.room.id, before.history.next_cursor ?? undefined, controller.signal);
      if (controller.signal.aborted || generation !== sequence.current || binding.current.api !== api || binding.current.authRevision !== authRevision) return;
      const items = [...before.history.items, ...next.items.filter(item => !before.history.items.some(old => old.id === item.id))];
      setState({ phase: "ready", api, authRevision, data: { ...before, history: { items, next_cursor: next.next_cursor } } });
    } catch (error) {
      if (!controller.signal.aborted && generation === sequence.current) {
        pending.current = null; setState({ phase: "error", message: operationsMessage(error) });
      }
    } finally { if (active.current?.controller === controller) { active.current = null; setHistoryBusy(false); } }
  }
  function back() { setModal(null); setActionError(""); setNotice(""); void load({ kind: "rooms", cursor: listCursor.current }); }

  const displayModal = modal?.api === api && modal.authRevision === authRevision ? modal : null;
  return <div className="ops-page">
    {(!current || current.kind === "rooms") && <header className="ops-heading"><div><span className="ops-eyebrow">운영 관리</span><h1>모임을 살펴볼까요?</h1>
      <p className="ops-muted">입력과 분석 상태를 확인하고 필요한 모임을 다시 분석할 수 있어요.</p></div>
      <nav className="operations-nav"><button className="ops-button" onClick={() => void load({ kind: "rooms" })}><RefreshCw size={15} aria-hidden="true" />새로고침</button></nav></header>}
    {(state.phase === "loading" || (state.phase === "ready" && current === null)) && <p className="ops-card ops-empty" role="status">운영 정보를 불러오는 중이에요.</p>}
    {state.phase === "error" && <section className="ops-card ops-empty"><p role="alert">{state.message}</p><button className="ops-button" onClick={() => void load(target.current)}>다시 조회</button></section>}
    {current?.kind === "rooms" && <>
      <div className="ops-toolbar"><div className="ops-filters" aria-label="모임 상태 필터">{[["all", "전체"], ["progress", "진행 중"], ["attention", "확인 필요"], ["complete", "완료"]].map(([key, label]) =>
        <button key={key} className={`ops-filter ${filter === key ? "ops-active" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key!)}>{label}</button>)}</div>
        <label className="ops-search"><Search size={17} aria-hidden="true" /><input aria-label="현재 목록에서 모임 제목 검색" placeholder="현재 목록에서 제목 검색" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <div className="ops-card"><table className="ops-rooms"><thead><tr><th scope="col">모임</th><th scope="col">모임 예정 기간</th><th scope="col">상태</th><th scope="col"><span className="sr-only">상세</span></th></tr></thead>
        <tbody>{current.page.items.filter(room => (!search.trim() || (room.title ?? "").includes(search.trim())) && (filter === "all" || roomStatus(room).group === filter)).map(room =>
          <tr key={room.id}><td><button className="ops-room-name" onClick={() => void load({ kind: "room", id: room.id })}>{room.title || "이름 없는 모임"}</button>
            <div className="ops-room-meta">{stamp(room.created_at, room.time_zone_id)} 생성 · 입력 {room.submitted_participant_count}/{room.participant_count}명<span className="ops-mobile-date"> · {dateRange(room)}</span></div></td>
            <td className="ops-date">{dateRange(room)}</td><td><Pill text={roomStatus(room).label} tone={roomStatus(room).tone} /></td><td className="ops-row-arrow"><ArrowRight size={16} aria-hidden="true" /></td></tr>)}</tbody></table>
        {current.page.items.filter(room => (!search.trim() || (room.title ?? "").includes(search.trim())) && (filter === "all" || roomStatus(room).group === filter)).length === 0 &&
          <p className="ops-empty">{current.page.items.length === 0 ? "조회할 모임이 없어요." : "현재 페이지에 조건과 맞는 모임이 없어요."}</p>}
        <div className="ops-table-bottom"><span>최근 생성 순 · 불러온 {current.page.items.length}개 내 검색·필터</span>
          {current.page.next_cursor && <button className="ops-button" onClick={() => void load({ kind: "rooms", cursor: current.page.next_cursor! })}>다음 모임<ArrowRight size={13} aria-hidden="true" /></button>}</div></div>
    </>}
    {current?.kind === "room" && (() => {
      const { detail, history, view } = current; const room = detail.room;
      const status = view.analysis && !(view.analysis.active && room.current_analysis_confirmed) ? analysisStatus(view.analysis.status) : roomStatus(room);
      const eligible = canReanalyze(room, view) && !sending && !pendingRetry;
      return <section><button className="ops-back" disabled={sending} onClick={back}><ArrowLeft size={15} aria-hidden="true" />모임 목록</button>
        <div className="ops-heading ops-detail-heading"><div><div className="ops-title-line"><h1>{room.title || "이름 없는 모임"}</h1><Pill text={status.label} tone={status.tone} /></div>
          <p className="ops-muted ops-caption">{stamp(room.created_at, room.time_zone_id)} 생성 · 참여자 {room.participant_count}명</p></div>
          <div className="ops-detail-actions"><select aria-label="조회할 분석 이력" value={view.analysis?.id ?? "current"} disabled={sending} onChange={event => void load({ kind: "room", id: room.id, analysisId: event.target.value === "current" ? null : event.target.value })}>
            <option value="current">현재 접수·검사 입력</option>{history.items.map(item => <option key={item.id} value={item.id}>{item.active ? "현재 분석" : "이전 분석"} · {stamp(item.created_at, room.time_zone_id)}</option>)}</select>
            <button className="ops-button ops-primary" disabled={!eligible} onClick={event => { if (view.analysis && room.state_version !== undefined) setModal({ api, authRevision, roomId: room.id, source: view.analysis.id, version: room.state_version, title: room.title || "이름 없는 모임", button: event.currentTarget }); }}><RefreshCw size={16} aria-hidden="true" />{sending ? "접수 확인 중" : "다시 분석"}</button></div></div>
        {history.next_cursor && <button className="ops-history-more" disabled={historyBusy || sending} onClick={() => void moreHistory()}>{historyBusy ? "이력 조회 중…" : "이전 분석 이력 더보기"}</button>}
        {notice && <p className="ops-notice" role="status">{notice}</p>}
        {actionError && <div className="ops-action-error"><p role="alert">{actionError}</p>{pendingRetry && <button className="ops-button" disabled={sending} onClick={() => void sendPending()}>같은 요청으로 접수 확인</button>}{!pendingRetry && <button className="ops-button" onClick={() => void load({ kind: "room", id: room.id })}>최신 상태 조회</button>}</div>}
        <div className="ops-card ops-room-info"><div><div className="ops-info-label">모임 예정 기간</div><div className="ops-info-value">{dateRange(room)}</div></div>
          <div><div className="ops-info-label">모임 방식</div><div className="ops-info-value">{modeLabel[room.meeting_mode]}</div></div>
          <div><div className="ops-info-label">기준 시간대</div><div className="ops-info-value">{room.time_zone_id === "Asia/Seoul" ? "서울" : room.time_zone_id}</div></div>
          <div><div className="ops-info-label">현재 입력 현황</div><div className="ops-info-value">{room.submitted_participant_count}명 / {room.participant_count}명</div></div></div>
        {view.analysis && !view.analysis.active && <p className="ops-old-note">이전 분석의 고정 입력과 결과예요. 다시 분석은 현재 분석에서 실행할 수 있어요.</p>}
        {room.current_analysis_confirmed && <p className="ops-old-note">확정한 모임은 다시 분석할 수 없어요.</p>}
        {room.has_open_revision_round && <p className="ops-old-note">참여자가 입력을 수정 중이에요. 수정이 끝나면 다시 분석할 수 있어요.</p>}
        <AnalysisOutcome data={view} />
        <div className="ops-detail-grid"><div><InputCards data={view} zone={room.time_zone_id} /><StoredResults data={view} zone={room.time_zone_id} /></div><AnalysisTimeline data={view} zone={room.time_zone_id} /></div>
        <details className="ops-records ops-room-technical"><summary>모임의 세부 설정·기록 범위</summary><RoomSettings room={room} />
          <p>입력 수정 기록 · 진행 중 {detail.revision_counts.open}, 대기 {detail.revision_counts.queued}, 재사용 {detail.revision_counts.reused}</p>
          <p>이 모임의 구형 실행 시도 {detail.legacy_attempt_count}건 · 연결된 모델별 실행은 위 선택 분석 기록에 표시해요.</p>
          {view.analysis && <p>분석 경로: {view.analysis.contract} · 입력 고정: {stamp(view.analysis.fixed_at, room.time_zone_id)}</p>}</details>
      </section>;
    })()}
    {displayModal && <ReanalysisDialog title={displayModal.title} returnFocusTo={displayModal.button} onCancel={cancel} onConfirm={confirm} />}
  </div>;
}
