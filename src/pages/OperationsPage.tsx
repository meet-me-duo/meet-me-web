import { useCallback, useEffect, useRef, useState } from "react";
import { OperationsError, operationsApi, operationsMessage, type OperationInvocation, type OperationInvocationDetail, type OperationRoom, type OperationRoomDetail, type OperationRooms, type OperationsApi } from "../api/operations";
import "./OperationsPage.css";

type Target = { kind: "rooms"; cursor?: string } | { kind: "room"; id: string; cursor?: string } | { kind: "invocation"; id: string };
type Result = { kind: "rooms"; data: OperationRooms } | { kind: "room"; data: OperationRoomDetail } | { kind: "invocation"; data: OperationInvocationDetail };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; result: Result; api: OperationsApi; authRevision: number };
const unknown = "알 수 없음";
const value = (n: number | string | null) => n === null ? unknown : String(n);
const elapsed = (n: number | null) => n === null ? unknown : `${n} ms`;
const cost = (n: string | null) => n === null ? unknown : `USD ${n}`;

function RoomSettings({ room }: { room: OperationRoom }) {
  return <section className="operations-card">
    <h2>현재 방 설정</h2><p>조회 시점의 설정과 상태입니다. 실행 당시 설정의 스냅샷이 아닙니다.</p>
    <dl className="operations-fields">
      <dt>방 ID</dt><dd>{room.id}</dd><dt>생성 시각 (ISO)</dt><dd>{room.created_at}</dd>
      <dt>방식 / 시간대</dt><dd>{room.meeting_mode} / {room.time_zone_id}</dd>
      <dt>검색 시작일</dt><dd>{room.search_start_date}</dd><dt>검색 종료일 (미포함)</dt><dd>{room.search_end_date}</dd>
      <dt>예상 인원</dt><dd>{value(room.expected_participants)}</dd><dt>제출 마감 (ISO)</dt><dd>{value(room.submission_deadline)}</dd>
      <dt>수동 마감 전용</dt><dd>{room.manual_only ? "예" : "아니요"}</dd><dt>수집 상태</dt><dd>{room.collection_status}</dd>
      <dt>마감 사유 / 시각 (ISO)</dt><dd>{value(room.closure_reason)} / {value(room.closed_at)}</dd>
      <dt>참여 인원 / 제출 인원</dt><dd>{room.participant_count} / {room.submitted_participant_count}</dd>
      <dt>호스트 제출</dt><dd>{room.host_submitted ? "제출" : "미제출"}</dd>
      <dt>현재 저장된 분석 상태</dt><dd>{value(room.current_run_status)}</dd>
    </dl>
  </section>;
}
function InvocationFields({ invocation: item }: { invocation: OperationInvocation }) {
  return <dl className="operations-fields">
    <dt>실행 ID</dt><dd>{item.id}</dd><dt>분석 run ID</dt><dd>{item.run_id}</dd>
    <dt>저장된 구조화 버전 / 실행 순번</dt><dd>{item.run_version} / {item.execution_ordinal}</dd>
    <dt>시작 / 제한 시각 (ISO)</dt><dd>{item.started_at} / {item.deadline_at}</dd>
    <dt>기록 종료 시각 (ISO)</dt><dd>{value(item.finished_at)}</dd><dt>선택된 시도 ID</dt><dd>{value(item.winner_attempt_id)}</dd>
    <dt>기록된 시도 (GEMINI / OPENAI)</dt><dd>{item.gemini_admitted_attempts} / {item.luna_admitted_attempts}</dd>
    <dt>수정 라운드 연결</dt><dd>{item.revision_linked ? "있음" : "없음"}</dd>
    <dt>기록된 경과 시간</dt><dd>{elapsed(item.recorded_elapsed_millis)}</dd>
    <dt>Parser dispatch 횟수</dt><dd>{value(item.parser_dispatch_count)}</dd><dt>HTTP 요청 횟수</dt><dd>{unknown}</dd>
  </dl>;
}
function ExecutionDetail({ data }: { data: OperationInvocationDetail }) {
  return <>
    <section className="operations-card"><h2>실행 기록 상세</h2>
      <p>기록 종료나 선택된 시도가 있어도 최종 결과 게시를 뜻하지 않습니다. 경과 시간은 저장 시각 차이며 HTTP 지연 측정값이 아닙니다.</p>
      <InvocationFields invocation={data.invocation} />
    </section>
    <section className="operations-card"><h2>로컬 client call 관측</h2>
      <p>관측된 승인 시도 {data.invocation.transport_observed_attempt_count ?? 0} · 미관측 승인 시도 {data.invocation.transport_unknown_attempt_count ?? data.invocation.gemini_admitted_attempts + data.invocation.luna_admitted_attempts}</p>
      <p>알려진 로컬 호출 소계 {data.invocation.known_client_call_count ?? 0} · 전체 승인 관측이 있는 호출 수 {value(data.invocation.client_call_count ?? null)}</p>
      <p>client call은 이 프로세스의 로컬 호출 시작과 종결 기록입니다. COMPLETED에는 HTTP 오류도 포함됩니다. 공급자 수신이나 청구 여부는 알 수 없습니다.</p>
    </section>
    <section className="operations-card"><h2>알려진 사용량 소계</h2>
      <p>기록된 시도 승인(RECORDED_ADMISSIONS)이 분모입니다. 알려진 관측값만 더한 소계이며, 미상 값은 포함하지 않습니다.</p>
      <div className="operations-table" tabIndex={0} role="region" aria-label="공급자별 사용량 표, 가로 스크롤 가능">
        <table><caption>공급자별 기록된 사용량</caption><thead><tr><th scope="col">공급자</th><th scope="col">기록된 시도</th><th scope="col">입력 토큰 소계</th><th scope="col">출력 토큰 소계</th><th scope="col">알려진 비용 소계</th><th scope="col">입력 알려짐 / 미상</th><th scope="col">출력 알려짐 / 미상</th><th scope="col">비용 알려짐 / 미상</th></tr></thead>
          <tbody>{data.usage_by_provider.map(item => <tr key={item.provider}><th scope="row">{item.provider}</th><td>{item.recorded_attempt_count}</td><td>{value(item.known_input_tokens)}</td><td>{value(item.known_output_tokens)}</td><td>{cost(item.known_cost_usd)}</td><td>{item.input_known_count} / {item.input_unknown_count}</td><td>{item.output_known_count} / {item.output_unknown_count}</td><td>{item.cost_known_count} / {item.cost_unknown_count}</td></tr>)}</tbody>
        </table>
      </div>{data.usage_by_provider.length === 0 && <p>사용량 기록이 없습니다.</p>}
    </section>
    <section className="operations-card"><h2>기록된 시도</h2><p>INITIAL / RETRY / FALLBACK은 이 실행 안의 admission 순서 분류입니다. 실제 HTTP 전송 여부는 알 수 없음입니다. 나중 실행의 사람 요청 사유를 추정하지 않습니다.</p>
      {data.attempts.length === 0 && <p>시도 기록이 없습니다.</p>}
      {data.attempts.map(item => <article className="operations-attempt" key={item.id}><h3>{item.attempt_number}. {item.provider} · {item.role}</h3>
        <dl className="operations-fields"><dt>시도 ID</dt><dd>{item.id}</dd><dt>모델 / 정책 버전</dt><dd>{item.model} / {item.policy_version}</dd>
          <dt>시작 / 종료 시각 (ISO)</dt><dd>{item.started_at} / {value(item.finished_at)}</dd><dt>실패 분류</dt><dd>{value(item.failure_kind)}</dd>
          <dt>입력 토큰</dt><dd>{value(item.input_tokens)}</dd><dt>출력 토큰</dt><dd>{value(item.output_tokens)}</dd><dt>알려진 추정 비용</dt><dd>{cost(item.estimated_cost_usd)}</dd>
          <dt>기록된 경과 시간</dt><dd>{elapsed(item.recorded_elapsed_millis)}</dd><dt>Parser dispatch 여부</dt><dd>{item.parser_dispatched === null ? unknown : item.parser_dispatched ? "진입함" : "진입 안 함"}</dd>
          <dt>로컬 client call 수</dt><dd>{item.client_calls == null ? unknown : item.client_calls.length}</dd>
        </dl>
        {item.client_calls != null && item.client_calls.length > 0 && <ol aria-label="로컬 client call 기록">{item.client_calls.map(call => <li key={call.call_number}>
          {call.call_number}. {call.outcome} · HTTP status {value(call.http_status)} · {call.elapsed_nanos} ns
        </li>)}</ol>}
        </article>)}
    </section>
  </>;
}

export default function OperationsPage({ api = operationsApi, authRevision = 0 }: { api?: OperationsApi; authRevision?: number }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const active = useRef<{ controller: AbortController; key: string } | null>(null);
  const retryTarget = useRef<Target>({ kind: "rooms" });
  const load = useCallback(async (target: Target) => {
    const key = JSON.stringify(target);
    if (active.current?.key === key) return;
    active.current?.controller.abort();
    const controller = new AbortController();
    active.current = { controller, key };
    retryTarget.current = target;
    setState({ status: "loading" });
    try {
      let result: Result;
      if (target.kind === "rooms") result = { kind: "rooms", data: await api.rooms(target.cursor, controller.signal) };
      else if (target.kind === "room") result = { kind: "room", data: await api.room(target.id, target.cursor, controller.signal) };
      else result = { kind: "invocation", data: await api.invocation(target.id, controller.signal) };
      if (active.current?.controller === controller && !controller.signal.aborted) setState({ status: "ready", result, api, authRevision });
    } catch (error) {
      if (active.current?.controller !== controller || controller.signal.aborted) return;
      if (error instanceof OperationsError && [401, 403, 404].includes(error.status)) retryTarget.current = { kind: "rooms" };
      setState({ status: "error", message: operationsMessage(error) });
    } finally {
      if (active.current?.controller === controller) active.current = null;
    }
  }, [api, authRevision]);
  useEffect(() => {
    void load({ kind: "rooms" });
    return () => { active.current?.controller.abort(); active.current = null; retryTarget.current = { kind: "rooms" }; };
  }, [load]);
  const result = state.status === "ready" && state.api === api && state.authRevision === authRevision ? state.result : null;
  return <div className="operations-page page-width">
    <header><span className="eyebrow subtle">읽기 전용</span><h1>운영 요약</h1><p>허가된 운영자만 조회할 수 있습니다. 방 주최자 권한과 별개입니다.</p></header>
    <nav className="operations-nav" aria-label="운영 조회 이동"><button className="button secondary" onClick={() => void load({ kind: "rooms" })}>방 목록</button>
      {result?.kind === "invocation" && <button className="button secondary" onClick={() => void load({ kind: "room", id: result.data.room_id })}>방 상세</button>}
    </nav>
    {(state.status === "loading" || (state.status === "ready" && result === null)) && <p role="status">운영 요약을 불러오는 중입니다.</p>}
    {state.status === "error" && <section className="operations-card"><p role="alert">{state.message}</p><button className="button secondary" onClick={() => void load(retryTarget.current)}>다시 조회</button></section>}
    {result?.kind === "rooms" && <section className="operations-card"><h2>방 목록</h2><p>최근 생성 순서 · 페이지당 최대 20개</p>
      {result.data.items.length === 0 && <p>조회할 방이 없습니다.</p>}
      <ul className="operations-list">{result.data.items.map(room => <li key={room.id}><button className="button secondary" onClick={() => void load({ kind: "room", id: room.id })}>방 {room.id}</button><span>{room.created_at} · {room.collection_status} · 제출 {room.submitted_participant_count} / 참여 {room.participant_count}</span></li>)}</ul>
      {result.data.next_cursor !== null && <button className="button primary" onClick={() => void load({ kind: "rooms", cursor: result.data.next_cursor! })}>다음 방</button>}
    </section>}
    {result?.kind === "room" && <><RoomSettings room={result.data.room} /><section className="operations-card"><h2>수정 라운드와 이전 기록</h2><p>OPEN {result.data.revision_counts.open} · QUEUED {result.data.revision_counts.queued} · REUSED {result.data.revision_counts.reused}</p><p>REUSED는 새 공급자 시도와 별도로 집계됩니다.</p><p>레거시 시도 {result.data.legacy_attempt_count}개 · dispatch / HTTP 전송 횟수는 {unknown}</p></section>
      <section className="operations-card"><h2>구조화 실행 기록</h2><p>한 실행 안의 공급자 재시도와 이후 논리적 실행을 구별합니다.</p>
        {result.data.invocations.length === 0 && <p>실행 기록이 없습니다.</p>}
        <ul className="operations-list">{result.data.invocations.map(item => <li key={item.id}><button className="button secondary" onClick={() => void load({ kind: "invocation", id: item.id })}>실행 {item.id}</button><span>실행 순번 {item.execution_ordinal} · 저장 버전 {item.run_version} · 시작 {item.started_at}</span></li>)}</ul>
        {result.data.next_cursor !== null && <button className="button primary" onClick={() => void load({ kind: "room", id: result.data.room.id, cursor: result.data.next_cursor! })}>다음 실행</button>}
      </section></>}
    {result?.kind === "invocation" && <ExecutionDetail data={result.data} />}
  </div>;
}
