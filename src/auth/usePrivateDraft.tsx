import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "../api/types";
import { viewerContext } from "../api/recovery";
import { getSession, getSessionVersion } from "./session";
import { clearQuarantinedDraft, quarantineDraft, recoverQuarantinedDraft, type RecoveredDraft } from "./draftQuarantine";

type Props = { room: Room; editorKind: "PRECHECK" | "PRECHECK_ANSWER" | "LEGACY"; questionId?: string; revision: number; fresh: boolean; onRecovered: (raw: string, baseRevision: number) => void };
/** Fresh room ownership is supplied by the parent; fresh private data is required separately. */
export function usePrivateDraft({ room, editorKind, questionId, revision, fresh, onRecovered }: Props) {
  const accountId = getSession()?.account.id;
  const epoch = getSessionVersion();
  const context = viewerContext(room);
  const read = useRef<string | null>(null);
  const restore = useRef(onRecovered); restore.current = onRecovered;
  const [conflict, setConflict] = useState<RecoveredDraft | null>(null);
  const active = () => !!accountId && room.viewer.joined && getSession()?.account.id === accountId && getSessionVersion() === epoch;
  const identity = { verifiedAccountId: accountId ?? "", room: room.invite_code, viewerContext: context, candidateRevision: revision, editorKind, questionId };
  useEffect(() => {
    const scope = `${editorKind}:${questionId ?? ""}`;
    if (read.current === scope || !fresh || !accountId || !room.viewer.joined || getSession()?.account.id !== accountId || getSessionVersion() !== epoch) return;
    read.current = scope;
    setConflict(null);
    const saved = recoverQuarantinedDraft({ verifiedAccountId: accountId, room: room.invite_code, viewerContext: context, candidateRevision: revision, editorKind, questionId });
    if (saved?.conflict) setConflict(saved);
    else if (saved) restore.current(saved.rawText, saved.candidateBaseRevision);
  }, [accountId, epoch, room.invite_code, room.viewer.joined, context, revision, editorKind, questionId, fresh]);
  const remember = (rawText: string, candidateBaseRevision: number) => {
    if (active()) quarantineDraft({ ...identity, candidateBaseRevision, rawText });
  };
  const discardFor = useCallback((kind: Props["editorKind"], targetQuestion?: string) => {
    if (accountId && room.viewer.joined && getSession()?.account.id === accountId && getSessionVersion() === epoch && recoverQuarantinedDraft({ verifiedAccountId: accountId, room: room.invite_code, viewerContext: context, candidateRevision: revision, editorKind: kind, questionId: targetQuestion })) clearQuarantinedDraft();
  }, [accountId, room.viewer.joined, room.invite_code, epoch, context, revision]);
  const discard = useCallback(() => {
    discardFor(editorKind, questionId);
    setConflict(null);
  }, [discardFor, editorKind, questionId]);
  const conflictPanel = conflict ? <section className="glass-card side-card" aria-label="보관한 임시 입력"><h3>저장본과 다른 임시 입력이 있어요</h3><p>서버의 입력 버전이 바뀌었어요. 아래 내용은 아직 저장되지 않았으며 자동으로 반영하지 않아요.</p><label className="field"><span>보관한 임시 조건</span><textarea readOnly value={conflict.rawText} rows={4} /></label><div className="actions">{editorKind !== "PRECHECK_ANSWER" && <button className="button secondary" onClick={() => { if (!active()) return; restore.current(conflict.rawText, revision); remember(conflict.rawText, revision); setConflict(null); }}>임시 입력 사용</button>}<button className="button secondary" onClick={discard}>임시 입력 버리기</button></div></section> : null;
  return { remember, discard, discardFor, conflictPanel };
}
