import { getSessionRestoreStatus, setSessionRestoreStatus, type SessionRestoreStatus } from "./sessionRestoration";
import { clearQuarantinedDraft, retainQuarantinedDraftForAccount } from "./draftQuarantine";
import { runAuthCookieRequest } from "./authCookieLock";
export interface Account { id: string; displayName: string; capabilities?: { canViewOperations: boolean } }
export interface AuthSession { accessToken: string; expiresAt: string; account: Account }
export { getSessionRestoreStatus } from "./sessionRestoration";
export type { SessionRestoreStatus } from "./sessionRestoration";
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
let session: AuthSession | null = null;
let version = 0;
let generation = 0;
let profileRevision = 0;
let restoring: Promise<Account | null> | null = null;
const listeners = new Set<() => void>();
function publish(next: AuthSession | null, status: SessionRestoreStatus = next ? "authenticated" : "anonymous") {
  setSessionRestoreStatus(status);
  if (next) retainQuarantinedDraftForAccount(next.account.id);
  if (session?.account.id !== next?.account.id) version++;
  session = next;
  for (const listener of listeners) listener();
}
function validSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  return typeof candidate.accessToken === "string" && candidate.accessToken.length > 0 && typeof candidate.expiresAt === "string" && Date.parse(candidate.expiresAt) > Date.now() && typeof candidate.account?.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.account.id) && typeof candidate.account.displayName === "string" && candidate.account.displayName.trim().length > 0;
}
export function getSession(): AuthSession | null { return session; }
export function getAccessToken(requireValidSession = false): string | null {
  if (session && Date.parse(session.expiresAt) <= Date.now() && requireValidSession) throw new Error("AUTH_ACCESS_EXPIRED");
  return session && Date.parse(session.expiresAt) > Date.now() ? session.accessToken : null;
}
export function getSessionVersion(): number { return version; }
export function subscribeSession(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function restoreSession(): Promise<Account | null> {
  if (restoring) return restoring;
  const started = generation;
  const startedProfile = profileRevision;
  const knownAccount = session !== null || getSessionRestoreStatus() === "expired";
  setSessionRestoreStatus("checking");
  for (const listener of listeners) listener();
  const work = runAuthCookieRequest(async () => {
    if (started !== generation) return null;
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include", headers: { Accept: "application/json" } });
      if (started !== generation) return null;
      const body: unknown = response.ok ? await response.json() : null;
      if (started !== generation) return null;
      let next = validSession(body) ? body : null;
      // A refresh begun before a confirmed profile save can carry the old name.
      // Preserve only that name; tokens, expiry and capabilities still come from refresh.
      if (next && startedProfile !== profileRevision && session?.account.id === next.account.id) {
        next = { ...next, account: { ...next.account, displayName: session.account.displayName } };
      }
      publish(next, next ? "authenticated" : response.status === 401 ? knownAccount ? "expired" : "anonymous" : "unavailable");
      return next?.account ?? null;
    } catch {
      if (started === generation) publish(null, "unavailable");
      return null;
    }
  });
  restoring = work;
  void work.finally(() => { if (restoring === work) restoring = null; });
  return work;
}

export type ProfileUpdateOutcome = { status: "updated" | "saved_session_unavailable"; version: number } | { status: "stale" };

/** PUT confirms the profile only. A normal cookie refresh supplies the new JWT. */
export async function completeAccountProfileUpdate(account: Account, expectedVersion: number): Promise<ProfileUpdateOutcome> {
  if (!session || session.account.id !== account.id || version !== expectedVersion) return { status: "stale" };
  const started = generation;
  profileRevision++;
  publish({ ...session, account });
  const previousRefresh = restoring;
  if (previousRefresh) await previousRefresh;
  if (started !== generation || session && (session.account.id !== account.id || version !== expectedVersion)) return { status: "stale" };
  if (!session) return { status: "saved_session_unavailable", version };
  // Do not join a refresh that started before the confirmed save.
  if (restoring === previousRefresh) restoring = null;
  const refreshed = await restoreSession();
  if (started !== generation || refreshed && (refreshed.id !== account.id || version !== expectedVersion)) return { status: "stale" };
  return { status: refreshed ? "updated" : "saved_session_unavailable", version };
}
export async function endSession(allDevices = false): Promise<void> {
  const token = getAccessToken();
  generation++;
  clearQuarantinedDraft();
  version++;
  restoring = null;
  publish(null);
  const response = await runAuthCookieRequest(() => fetch(`${API_BASE}/api/auth/${allDevices ? "logout-all" : "logout"}`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  if (!response.ok) throw new Error("기기 로그아웃을 서버에서 확인하지 못했어요. 이 화면의 로그인 정보는 지웠어요. 다시 로그인한 뒤 기기 로그아웃을 확인해 주세요.");
}
