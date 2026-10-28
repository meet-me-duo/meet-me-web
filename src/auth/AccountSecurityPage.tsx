import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { LoginGate } from "./AccountViews";
import { useAccountSession } from "./useAccount";
import { useAccountActions } from "./useAccountActions";
import { subscribeSession } from "./session";
import { getSessionRestoreStatus } from "./sessionRestoration";

export default function AccountSecurityPage() {
  const session = useAccountSession();
  const { busy, logout } = useAccountActions();
  const status = useSyncExternalStore(subscribeSession, getSessionRestoreStatus, getSessionRestoreStatus);
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const disabled = busy || status === "checking";
  useEffect(() => {
    const element = dialog.current;
    if (!confirm || !element) return;
    const returnFocus = trigger.current;
    if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (element.open && typeof element.close === "function") element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [confirm]);
  const close = () => { if (!busy) setConfirm(false); };
  const keyboard = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  if (!session) return <LoginGate returnTo="/account/security" />;
  return <section className="page-width narrow account-card account-security-page">
    <Link to="/account/rooms" className="login-back"><ArrowLeft size={18} aria-hidden="true" />내 모임으로</Link>
    <Card><CardHeader><span className="eyebrow"><ShieldCheck size={17} aria-hidden="true" />계정</span><h1>계정 보안</h1></CardHeader>
      <CardContent><h2>모든 기기 로그아웃</h2><p>현재 기기를 포함해 이 계정으로 로그인한 모든 기기에서 다시 로그인해야 해요.</p>
        <p>다른 기기의 접근은 최대 15분간 이어질 수 있어요. Google·Kakao 계정 연결은 유지돼요.</p>
        <Button ref={trigger} variant="danger-outline" disabled={disabled} onClick={() => setConfirm(true)}>모든 기기 로그아웃</Button>
      </CardContent>
    </Card>
    {confirm && <dialog ref={dialog} className="account-security-dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard}>
      <div className="account-security-content"><ShieldCheck size={22} aria-hidden="true" /><h2 id={`${id}-title`}>모든 기기에서 로그아웃할까요?</h2>
        <div id={`${id}-description`}><p>현재 기기를 포함한 모든 기기의 로그인을 종료해요. 다른 기기의 접근은 최대 15분간 이어질 수 있어요.</p><p>Google·Kakao 계정 연결은 유지돼요.</p></div>
        <div className="account-security-actions"><Button variant="secondary" disabled={busy} onClick={close}>취소</Button>
          <Button variant="danger-outline" disabled={disabled} onClick={() => void logout(true, session.account.id)}>모든 기기에서 로그아웃</Button></div>
      </div>
    </dialog>}
  </section>;
}
