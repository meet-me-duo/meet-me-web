import { Link } from "react-router-dom";
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
      </CardContent>
    </Card>
  </section>;
}
export { AccountArchive } from "./AccountHistoryPage";
