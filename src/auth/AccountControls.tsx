import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Gauge, LogOut, PencilLine, ShieldCheck, UserRound } from "lucide-react";
import { getSessionVersion, subscribeSession, type Account, type ProfileUpdateOutcome } from "./session";
import { getSessionRestoreStatus } from "./sessionRestoration";
import { useAccountSession } from "./useAccount";
import { useAccountActions } from "./useAccountActions";
import { NicknameEditDialog } from "./NicknameEditDialog";
import { updateDisplayName } from "./updateDisplayName";

function AccountMenu({ account, busy, onLogout, onSaved }: { account: Account; busy: boolean; onLogout: () => void; onSaved: (outcome: ProfileUpdateOutcome) => void }) {
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ returnFocusTo: HTMLButtonElement | null } | null>(null);
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
      <button type="button" className="account-menu-item" disabled={busy} onClick={() => { setOpen(false); setEditor({ returnFocusTo: trigger.current }); }}><PencilLine size={17} aria-hidden="true" />닉네임 변경</button>
      <button type="button" className="account-menu-item" disabled={busy} onClick={() => { setOpen(false); onLogout(); }}><LogOut size={17} aria-hidden="true" />로그아웃</button>
      <Link className="account-menu-item" to="/account/security" onClick={() => setOpen(false)}><ShieldCheck size={17} aria-hidden="true" />계정 보안</Link>
      {account.capabilities?.canViewOperations === true && <Link className="account-menu-item" to="/operations" onClick={() => setOpen(false)}><Gauge size={17} aria-hidden="true" />어드민 페이지</Link>}
    </div>
    {editor && <NicknameEditDialog displayName={account.displayName} returnFocusTo={editor.returnFocusTo} onCancel={() => setEditor(null)} onSave={async name => { const outcome = await updateDisplayName(name); setEditor(null); onSaved(outcome); }} />}
  </div>;
}

export function AccountControls() {
  const session = useAccountSession();
  const [notice, setNotice] = useState<{ version: number; message: string; relogin: boolean } | null>(null);
  const status = useSyncExternalStore(subscribeSession, getSessionRestoreStatus, getSessionRestoreStatus);
  const location = useLocation();
  const { busy, error, logout } = useAccountActions();
  const login = useRef<HTMLAnchorElement>(null);
  const previousBusy = useRef(busy);
  useEffect(() => {
    if (!session && (previousBusy.current && !busy || notice?.version === getSessionVersion() && notice.relogin)) login.current?.focus();
    previousBusy.current = busy;
  }, [busy, session, notice]);
  const checking = status === "checking";
  return <div className="account-controls">
    {session ? <AccountMenu key={`${getSessionVersion()}:${session.account.id}:${location.pathname}`} account={session.account} busy={busy || checking} onLogout={() => { setNotice(null); void logout(false, session.account.id); }} onSaved={outcome => { if (outcome.status !== "stale" && outcome.version === getSessionVersion()) setNotice({ version: outcome.version, relogin: outcome.status === "saved_session_unavailable", message: outcome.status === "updated" ? "닉네임을 변경했어요." : "닉네임은 저장됐어요. 로그인 상태를 다시 확인해 주세요." }); }} />
      : busy || checking ? <span className="account-status" role="status">{busy ? "로그아웃 중…" : "로그인 확인 중…"}</span>
        : <Link ref={login} className="account-login" to="/login">로그인</Link>}
    {!session && !busy && !checking && status === "unavailable" && <span className="account-status" role="status">로그인 확인 필요</span>}
    {notice?.version === getSessionVersion() && <p className="nickname-save-notice" role="status">{notice.message}</p>}
    {!session && error?.version === getSessionVersion() && <p className="account-logout-error alert error" role="alert">{error.message}</p>}
  </div>;
}
