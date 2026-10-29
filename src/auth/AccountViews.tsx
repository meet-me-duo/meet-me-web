import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { SocialLoginActions } from "../components/SocialLoginActions";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
import { rememberLoginReturn } from "./loginReturn";
export function LoginGate({ returnTo = "/account/rooms" }: { returnTo?: string }) {
  return <section className="account-entry page-width narrow" aria-labelledby="login-title">
    <Link to="/" className="login-back"><ArrowLeft size={18} aria-hidden="true" /> 홈으로 돌아가기</Link>
    <Card className="account-card login-card">
      <h1 id="login-title" className="sr-only">로그인</h1>
      <CardContent>
        <SocialLoginActions apiBase={API_BASE} onBeforeNavigate={() => rememberLoginReturn(returnTo)} />
      </CardContent>
    </Card>
  </section>;
}
export { AccountArchive } from "./AccountHistoryPage";
