export type SessionRestoreStatus = "idle" | "checking" | "authenticated" | "anonymous" | "expired" | "unavailable";
let status: SessionRestoreStatus = "idle";
export function getSessionRestoreStatus(): SessionRestoreStatus { return status; }
export function setSessionRestoreStatus(next: SessionRestoreStatus): void { status = next; }
