import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, List, Search } from "lucide-react";
import { api, ApiError, errorMessage } from "../api/client";
import { decodeAccountRooms, type AccountRoomFilters, type AccountRoomRole } from "../api/accountRooms";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { formatDateTime } from "../utils/time";

type Draft = { role: "ALL" | AccountRoomRole; from: string; to: string; query: string };
const initial: Draft = { role: "ALL", from: "", to: "", query: "" };
const roles = { ALL: "전체", HOST: "주최", MEMBER: "참여" };
function validDate(value: string) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function AccountArchive() {
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [supportsHistory, setSupportsHistory] = useState(false);
  const from = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const filters: AccountRoomFilters = {
    ...(applied.role === "ALL" ? {} : { role: applied.role }),
    ...(applied.from ? { created_from: applied.from } : {}), ...(applied.to ? { created_to: applied.to } : {}),
    ...(applied.query ? { query: applied.query } : {}),
  };
  const query = useInfiniteQuery({
    queryKey: ["account-rooms", filters], initialPageParam: undefined as string | undefined, retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const page = decodeAccountRooms(await api.getAccountRooms(filters, pageParam, signal));
      if (pageParam !== undefined && page.kind !== "history") throw new Error("모임 목록 지원 상태가 바뀌었어요. 목록을 다시 조회해 주세요.");
      if (page.next_cursor !== null && page.next_cursor === pageParam) throw new Error("다음 모임 목록을 확인하지 못했어요. 잠시 후 다시 조회해 주세요.");
      return page;
    },
    getNextPageParam: page => page.has_more ? page.next_cursor ?? undefined : undefined,
  });
  const first = query.data?.pages[0];
  useEffect(() => { if (first) setSupportsHistory(first.kind === "history"); }, [first]);
  const rows = [...new Map(query.data?.pages.flatMap(page => page.rooms).map(row => [row.invite_code, row])).values()];
  const denied = query.error instanceof ApiError && ([401, 403, 404].includes(query.error.status) || query.error.problem.code === "AUTH_CONTEXT_CHANGED");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validDate(draft.from) || !validDate(draft.to) || draft.from && draft.to && draft.from > draft.to) {
      setFormError("생성일 기간을 확인해 주세요. 종료일은 시작일보다 빠를 수 없어요."); from.current?.focus(); return;
    }
    if ([...draft.query.trim()].length > 100) { setFormError("모임 이름은 앞뒤 공백을 제외하고 100자 이내로 입력해 주세요."); search.current?.focus(); return; }
    setFormError(null);
    const next = { ...draft, query: draft.query.trim() };
    if (JSON.stringify(next) === JSON.stringify(applied)) void query.refetch({ cancelRefetch: false }); else setApplied(next);
  };

  if (first?.kind === "legacy" && !denied) return <section className="page-width narrow account-card"><h1>내가 만든 모임</h1><p>현재 서버는 본인이 주최한 모임 목록만 지원해요. 참여 모임과 필터는 서버 업데이트 후 사용할 수 있어요.</p><p>방은 생성 또는 마감 후 30일이 지나면 정리돼요.</p>
    {rows.length === 0 ? <p>아직 만든 모임이 없어요.</p> : <ul className="archive-list">{rows.map(row => <li key={row.invite_code}><Link to={`/rooms/${encodeURIComponent(row.invite_code)}`}>{row.purpose}</Link><small>정리 예정 {formatDateTime(row.expires_at)}</small></li>)}</ul>}
    {query.isError && <p className="alert error" role="alert">{errorMessage(query.error)}</p>}<Link className="button primary" to="/create">모임 만들기</Link></section>;

  return <section className="page-width account-card account-history" aria-labelledby="account-history-title">
    <div className="account-history-heading"><div><span className="eyebrow"><List size={17} aria-hidden="true" />계정 기록</span><h1 id="account-history-title">내 모임</h1><p>주최하거나 참여한 모임을 계정으로 다시 찾을 수 있어요.</p></div><Link className="button primary" to="/create">모임 만들기</Link></div>
    <p className="field-hint">모임은 기존 보관 정책에 따라 생성 또는 마감 후 30일이 지나면 삭제돼요. 익명으로 참여한 과거 기록은 자동으로 연결되지 않아요.</p>
    {denied ? <div className="alert error" role="alert">{errorMessage(query.error)}</div> : <>
      {(supportsHistory || first?.kind === "history") && <Card className="account-history-filters"><CardHeader><h2>모임 찾기</h2></CardHeader><CardContent><form onSubmit={submit}>
        <fieldset className="account-history-roles"><legend>모임 구분</legend>{(Object.keys(roles) as (keyof typeof roles)[]).map(role => <label key={role}><input type="radio" name="history-role" value={role} checked={draft.role === role} onChange={() => setDraft(current => ({ ...current, role }))} />{roles[role]}</label>)}</fieldset>
        <div className="account-history-fields"><label className="field"><span><CalendarDays size={16} aria-hidden="true" />생성일 시작</span><input ref={from} type="date" value={draft.from} aria-describedby="history-date-hint" onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} /></label>
          <label className="field"><span>생성일 종료</span><input type="date" value={draft.to} aria-describedby="history-date-hint" onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} /></label>
          <label className="field account-history-search"><span><Search size={16} aria-hidden="true" />모임 이름</span><input ref={search} type="search" value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} placeholder="이름으로 검색" /></label></div>
        <p id="history-date-hint" className="field-hint">모임 생성일 기준 · 한국 시간 · 시작일과 종료일 모두 포함해요. 날짜를 비워 두면 보관 중인 전체 기간을 조회해요.</p>
        {formError && <p className="alert error" role="alert">{formError}</p>}
        <div className="account-history-filter-actions"><Button variant="secondary" onClick={() => { setDraft(initial); setApplied(initial); setFormError(null); }}>초기화</Button><Button type="submit">조회</Button></div>
      </form></CardContent></Card>}
      {query.isPending ? <p role="status">모임을 불러오는 중이에요.</p> : query.isError && !query.isFetchNextPageError ? <div className="alert error" role="alert"><p>{errorMessage(query.error)}</p><Button variant="secondary" onClick={() => void query.refetch()}>목록 다시 불러오기</Button></div> : <>
        <p className="account-history-summary" role="status">{roles[applied.role]} · 불러온 모임 {rows.length}개{applied.query ? ` · 이름 “${applied.query}”` : ""}</p>
        {rows.length === 0 ? <Card className="account-history-empty"><h2>조건에 맞는 모임이 없어요</h2><p>조회 조건을 바꾸거나 새 모임을 만들어 보세요.</p></Card> : <ul className="account-history-list">{rows.map(row => <li key={row.invite_code}><Card>
          <Link className="account-history-room" to={`/rooms/${encodeURIComponent(row.invite_code)}`}><strong>{row.purpose}</strong><span className="account-history-role">{roles[row.role]}</span></Link>
          <dl><div><dt>생성</dt><dd><time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time></dd></div><div><dt>정리 예정</dt><dd><time dateTime={row.expires_at}>{formatDateTime(row.expires_at)}</time></dd></div></dl>
        </Card></li>)}</ul>}
        {query.isFetchNextPageError && <div className="alert error" role="alert">{errorMessage(query.error)}</div>}
        {query.hasNextPage && <Button className="account-history-more" variant="secondary" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage({ cancelRefetch: false })}>{query.isFetchingNextPage ? "추가 모임을 불러오는 중…" : query.isFetchNextPageError ? "다음 모임 다시 불러오기" : "더 보기"}</Button>}
      </>}
    </>}
  </section>;
}
