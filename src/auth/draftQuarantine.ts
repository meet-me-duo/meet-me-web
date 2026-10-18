/** One bounded, memory-only private draft across account-boundary remounts. */
export type QuarantinedDraft = {
  verifiedAccountId: string;
  room: string;
  viewerContext: string;
  candidateBaseRevision: number;
  editorKind: "PRECHECK" | "LEGACY";
  rawText: string;
};
export type DraftRecoveryIdentity = {
  verifiedAccountId: string;
  room: string;
  viewerContext: string;
  candidateRevision: number;
  editorKind: "PRECHECK" | "LEGACY";
};
export type RecoveredDraft = { rawText: string; candidateBaseRevision: number; conflict: boolean };
let slot: QuarantinedDraft | null = null;
function sameOwner(identity: Pick<QuarantinedDraft, "verifiedAccountId" | "room" | "viewerContext" | "editorKind">) {
  return slot?.verifiedAccountId === identity.verifiedAccountId && slot.room === identity.room && slot.viewerContext === identity.viewerContext && slot.editorKind === identity.editorKind;
}
export function quarantineDraft(record: QuarantinedDraft): boolean {
  const length = Array.from(record.rawText).length;
  if (length === 0 || length > 500 || !record.verifiedAccountId || !record.room || !record.viewerContext || !Number.isSafeInteger(record.candidateBaseRevision) || record.candidateBaseRevision < 0) {
    if (sameOwner(record)) slot = null;
    return false;
  }
  slot = { ...record };
  return true;
}
export function recoverQuarantinedDraft(identity: DraftRecoveryIdentity): RecoveredDraft | null {
  if (!slot || !sameOwner(identity)) return null;
  return { rawText: slot.rawText, candidateBaseRevision: slot.candidateBaseRevision, conflict: slot.candidateBaseRevision !== identity.candidateRevision };
}
export function clearQuarantinedDraft(): void { slot = null; }
export function retainQuarantinedDraftForAccount(verifiedAccountId: string): void {
  if (slot && slot.verifiedAccountId !== verifiedAccountId) slot = null;
}
export function hasQuarantinedDraft(): boolean { return slot !== null; }

export function discardQuarantinedDraftForRoom(room: string): void {
  if (slot?.room === room) slot = null;
}
