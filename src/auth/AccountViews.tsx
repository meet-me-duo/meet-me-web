import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Room } from "../api/types";
import { formatDateTime } from "../utils/time";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
import { rememberLoginReturn } from "./loginReturn";
export function LoginGate({ returnTo = "/account/rooms" }: { returnTo?: string }) {
  return <section className="glass-card account-card page-width narrow"><h1>로그인하고 모임을 만들어 보세요</h1><p>내가 만든 모임을 다른 기기에서도 다시 찾을 수 있어요. 참여자는 로그인 없이 초대 링크로 참여할 수 있어요.</p><div className="account-actions"><a className="button secondary" href={`${API_BASE}/api/auth/google/start`} onClick={() => rememberLoginReturn(returnTo)}>Google로 로그인</a><a className="button kakao" href={`${API_BASE}/api/auth/kakao/start`} onClick={() => rememberLoginReturn(returnTo)}>Kakao로 로그인</a></div><p className="muted">로그인해도 이 브라우저의 기존 참여 기록은 자동으로 연결되지 않아요.</p></section>;
}
export function AccountArchive() {
  const query = useQuery({ queryKey: ["account-rooms"], queryFn: api.getAccountRooms, retry: false });
  return <section className="page-width narrow account-card"><h1>내가 만든 모임</h1><p>다른 기기에서도 이 계정으로 로그인하면 확인할 수 있어요. 방은 생성 또는 마감 후 30일이 지나면 정리돼요.</p>{query.isPending ? <p role="status">모임을 불러오는 중이에요.</p> : query.isError ? <div role="alert" className="alert error">{errorMessage(query.error)}</div> : query.data.rooms.length === 0 ? <p>아직 만든 모임이 없어요.</p> : <ul className="archive-list">{query.data.rooms.map(room => <li key={room.invite_code}><Link to={`/rooms/${encodeURIComponent(room.invite_code)}`}>{room.purpose}</Link><small>정리 예정 {formatDateTime(room.expires_at)}</small></li>)}</ul>}<Link className="button primary" to="/create">모임 만들기</Link></section>;
}
export function ClaimGuestParticipation({ inviteCode, onClaimed }: { inviteCode: string; onClaimed: (room: Room) => void }) {
  const [done, setDone] = useState(false);
  const mutation = useMutation({ mutationFn: () => api.claimGuestRoom(inviteCode), onSuccess: room => { setDone(true); onClaimed(room); }, retry: false });
  if (done) return <p role="status">이 계정에 기존 참여를 연결했어요.</p>;
  return <section className="glass-card claim-card"><h2>이 브라우저에 이전 참여가 있나요?</h2><p>기존 참여를 확인한 뒤 이 계정에 연결해요. 같은 방에 이미 계정 참여가 있으면 연결할 수 없어요.</p><button className="button secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "연결 확인 중…" : "이 브라우저의 기존 참여 연결"}</button>{mutation.isError && <p className="alert error" role="alert">{errorMessage(mutation.error)}</p>}</section>;
}
