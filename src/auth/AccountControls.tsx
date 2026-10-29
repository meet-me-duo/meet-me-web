import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Gauge, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { getSessionVersion, subscribeSession, type Account } from "./session";
import { getSessionRestoreStatus } from "./sessionRestoration";
import { useAccountSession } from "./useAccount";
import { useAccountActions } from "./useAccountActions";

function AccountMenu({ account, busy, onLogout }: { account: Account; busy: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="account-menu" ref={root} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="account-menu-trigger" aria-label={`${account.displayName} 계정 메뉴`}
      aria-expanded={open} aria-controls={`${id}-panel`} disabled={busy} onClick={() => setOpen(value => !value)}>
      <UserRound size={18} aria-hidden="true" /><span title={account.displayName}>{account.displayName}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <div hidden={!open} id={`${id}-panel`} className="account-menu-panel" role="group" aria-label="계정 동작">
      <button type="button" className="account-menu-item" disabled={busy} onClick={() => { setOpen(false); onLogout(); }}><LogOut size={17} aria-hidden="true" />로그아웃</button>
      <Link className="account-menu-item" to="/account/security" onClick={() => setOpen(false)}><ShieldCheck size={17} aria-hidden="true" />계정 보안</Link>
      {account.capabilities?.canViewOperations === true && <Link className="account-menu-item" to="/operations" onClick={() => setOpen(false)}><Gauge size={17} aria-hidden="true" />어드민 페이지</Link>}
    </div>
  </div>;
}

export function AccountControls() {
  const session = useAccountSession();
  const status = useSyncExternalStore(subscribeSession, getSessionRestoreStatus, getSessionRestoreStatus);
  const location = useLocation();
  const { busy, error, logout } = useAccountActions();
  const login = useRef<HTMLAnchorElement>(null);
  const previousBusy = useRef(busy);
  useEffect(() => {
    if (previousBusy.current && !busy && !session) login.current?.focus();
    previousBusy.current = busy;
  }, [busy, session]);
  const checking = status === "checking";
  return <div className="account-controls">
    {session ? <AccountMenu key={`${session.account.id}:${location.pathname}`} account={session.account} busy={busy || checking} onLogout={() => void logout(false, session.account.id)} />
      : busy || checking ? <span className="account-status" role="status">{busy ? "로그아웃 중…" : "로그인 확인 중…"}</span>
        : <Link ref={login} className="account-login" to="/login">로그인</Link>}
    {!session && !busy && !checking && status === "unavailable" && <span className="account-status" role="status">로그인 확인 필요</span>}
    {!session && error?.version === getSessionVersion() && <p className="account-logout-error alert error" role="alert">{error.message}</p>}
  </div>;
}
