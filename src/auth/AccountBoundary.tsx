import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { endSession, getSession, getSessionVersion, restoreSession, subscribeSession } from "./session";
import { useAccountSession } from "./useAccount";
import { takeLoginReturn } from "./loginReturn";

export function AccountBoundary({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(() => getSession() !== null);
  const privacyEpoch = useRef(getSessionVersion());
  const session = useAccountSession();
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
  return <>{children}</>;
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
