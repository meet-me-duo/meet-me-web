import { getSessionRestoreStatus } from "./sessionRestoration";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { endSession, getSession, getSessionVersion, restoreSession, subscribeSession } from "./session";
import { hasQuarantinedDraft } from "./draftQuarantine";
import { useAccountSession } from "./useAccount";
import { rememberLoginReturn, takeLoginReturn } from "./loginReturn";
import { SocialLoginLink } from "../components/SocialLoginLink";

export function AccountBoundary({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(() => getSession() !== null);
  const privacyEpoch = useRef(getSessionVersion());
  const session = useAccountSession();
  const status = useSyncExternalStore(subscribeSession, getSessionRestoreStatus, getSessionRestoreStatus);
  const location = useLocation();
  const recoveryIntent = useRef(false);
  const roomPath = /^\/rooms\/[A-Za-z0-9_-]{22}$/.test(location.pathname) ? location.pathname : null;
  useEffect(() => {
    const focus = () => { if (recoveryIntent.current) void restoreSession(); };
    const unload = (event: BeforeUnloadEvent) => { if (hasQuarantinedDraft()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("focus", focus); window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("beforeunload", unload); };
  }, []);
  useEffect(() => { if (session || status === "anonymous") recoveryIntent.current = false; }, [session, status]);
  useEffect(() => subscribeSession(() => {
    const next = getSessionVersion();
    if (privacyEpoch.current !== next) {
      privacyEpoch.current = next;
      void queryClient.cancelQueries();
      queryClient.clear();
    }
  }), [queryClient]);
  useEffect(() => { let active = true; if (!getSession()) void restoreSession().finally(() => { if (active) setReady(true); }); else setReady(true); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => { void restoreSession(); }, Math.max(0, Date.parse(session.expiresAt) - Date.now() - 30_000));
    return () => window.clearTimeout(timer);
  }, [session]);
  if (!ready) return <div className="center-state" role="status">로그인 상태를 확인하는 중이에요.</div>;
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  return <>{!session && roomPath && <section className="glass-card account-card page-width narrow" aria-label="계정 복구">
    <h2>{status === "expired" ? "로그인을 다시 확인해 주세요" : status === "unavailable" ? "로그인 상태를 확인하지 못했어요" : "계정으로 참여했나요?"}</h2>
    <p>같은 계정으로 로그인하면 서버에 저장된 입력을 다시 확인할 수 있어요. 제출 완료 여부는 저장본을 조회한 뒤 확인해 주세요.</p>
    <p>로그인한 계정과 본인 참여를 확인한 상태에서 입력한 내용만 이 탭에 임시 보관해요. 앞뒤 공백을 포함해 500자 이내 한 건만 보관하며, 이를 넘는 원문은 보관하지 않아요. 새로고침하거나 이 탭을 닫으면 미저장 내용은 사라져요. 이 탭을 유지하려면 새 탭에서 현재 방을 열고 로그인해 주세요.</p>
    <div className="account-actions"><a className="button secondary" href={roomPath} target="_blank" rel="noopener noreferrer" onClick={() => { recoveryIntent.current = true; }}>새 탭에서 로그인</a>
    <SocialLoginLink provider="google" label="같은 계정으로 Google 로그인" href={`${apiBase}/api/auth/google/start`} onClick={() => rememberLoginReturn(roomPath)} />
    <SocialLoginLink provider="kakao" label="같은 계정으로 Kakao 로그인" href={`${apiBase}/api/auth/kakao/start`} onClick={() => rememberLoginReturn(roomPath)} />
    <button className="button secondary" onClick={() => { recoveryIntent.current = true; void restoreSession(); }}>로그인 상태 다시 확인</button></div>
    {status === "checking" && <p role="status">로그인 상태를 확인하는 중이에요.</p>}
  </section>}{children}</>;
}
export function AccountControls() {
  const session = useAccountSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logout = async (all: boolean) => { setBusy(true); setError(null); try { await endSession(all); } catch (error) { setError(error instanceof Error ? error.message : "로그아웃을 확인하지 못했어요."); } finally { setBusy(false); } };
  return <div className="account-controls">{session ? <><span>{session.account.displayName}</span><button className="text-button" disabled={busy} onClick={() => void logout(false)}>로그아웃</button><button className="text-button" disabled={busy} onClick={() => void logout(true)}>모든 기기 로그아웃</button></> : null}{error && <p className="alert error" role="alert">{error}</p>}</div>;
}
export function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; void (getSession() ? Promise.resolve(getSession()!.account) : restoreSession()).then(account => { if (!active) return; if (account) navigate(takeLoginReturn(), { replace: true }); else setFailed(true); }); return () => { active = false; }; }, [navigate]);
  return <section className="center-state"><h1>{failed ? "로그인을 완료하지 못했어요" : "로그인을 마무리하고 있어요"}</h1>{failed && <><p>로그인이 취소되었거나 로그인 설정을 확인해야 해요. 잠시 후 다시 시도해 주세요.</p><a className="button secondary" href="/login">로그인 다시 시도</a></>}</section>;
}
