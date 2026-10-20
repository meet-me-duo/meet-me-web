const RETURN_KEY = "meetme.login-return";
export function rememberLoginReturn(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* Navigation can still complete at the archive. */ }
}
export function takeLoginReturn(): string {
  try { const path = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); return path?.startsWith("/") && !path.startsWith("//") ? path : "/account/rooms"; } catch { return "/account/rooms"; }
}
