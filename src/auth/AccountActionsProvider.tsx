import { useRef, useState, type ReactNode } from "react";
import { AccountActionsContext } from "./useAccountActions";
import { endSession, getSession, getSessionVersion } from "./session";

/** Lives outside the auth-keyed Routes so a server logout failure remains visible. */
export function AccountActionsProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ version: number; message: string } | null>(null);
  const locked = useRef(false);
  const logout = async (all: boolean, accountId: string) => {
    if (locked.current || getSession()?.account.id !== accountId) return;
    locked.current = true; setBusy(true); setError(null);
    try { await endSession(all); }
    catch {
      if (!getSession()) setError({ version: getSessionVersion(), message: all
        ? "이 화면의 로그인 정보는 지웠어요. 서버에서 모든 기기의 로그아웃을 확인하지 못했어요. 다시 로그인한 뒤 계정 보안에서 확인해 주세요."
        : "이 화면의 로그인 정보는 지웠어요. 서버에서 기기 로그아웃을 확인하지 못했어요. 다시 로그인한 뒤 확인해 주세요." });
    } finally { locked.current = false; setBusy(false); }
  };
  return <AccountActionsContext.Provider value={{ busy, error, logout }}>{children}</AccountActionsContext.Provider>;
}
