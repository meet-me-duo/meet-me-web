import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Room } from "../api/types";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { SocialLoginActions } from "../components/SocialLoginActions";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
import { rememberLoginReturn } from "./loginReturn";
export function LoginGate({ returnTo = "/account/rooms" }: { returnTo?: string }) {
  return <section className="account-entry page-width narrow" aria-labelledby="login-title">
    <Link to="/" className="login-back"><ArrowLeft size={18} aria-hidden="true" /> 홈으로 돌아가기</Link>
    <Card className="account-card login-card">
      <CardHeader>
        <span className="eyebrow"><ShieldCheck size={16} aria-hidden="true" /> 주최자 로그인</span>
        <h1 id="login-title">로그인하고 모임을 만들어 보세요</h1>
        <p>내가 만든 모임을 다른 기기에서도 다시 찾을 수 있어요. 참여자는 로그인 없이 초대 링크로 참여할 수 있어요.</p>
      </CardHeader>
      <CardContent>
        <SocialLoginActions apiBase={API_BASE} onBeforeNavigate={() => rememberLoginReturn(returnTo)} />
        <p className="login-note">로그인해도 이 브라우저의 기존 참여 기록은 자동으로 연결되지 않아요.</p>
      </CardContent>
    </Card>
  </section>;
}
export { AccountArchive } from "./AccountHistoryPage";
export function ClaimGuestParticipation({ inviteCode, onClaimed }: { inviteCode: string; onClaimed: (room: Room) => void }) {
  const [done, setDone] = useState(false);
  const mutation = useMutation({ mutationFn: () => api.claimGuestRoom(inviteCode), onSuccess: room => { setDone(true); onClaimed(room); }, retry: false });
  if (done) return <p role="status">이 계정에 기존 참여를 연결했어요.</p>;
  return <section className="glass-card claim-card"><h2>이 브라우저에 이전 참여가 있나요?</h2><p>기존 참여를 확인한 뒤 이 계정에 연결해요. 같은 방에 이미 계정 참여가 있으면 연결할 수 없어요.</p><button className="button secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "연결 확인 중…" : "이 브라우저의 기존 참여 연결"}</button>{mutation.isError && <p className="alert error" role="alert">{errorMessage(mutation.error)}</p>}</section>;
}
