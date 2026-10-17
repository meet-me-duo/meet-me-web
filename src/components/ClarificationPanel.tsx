import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../api/client";
import type { ClarificationAnswer, ClarificationList, ClarificationQuestion } from "../api/clarifications";
import type { Room } from "../api/types";
import { correctionOpen, viewerContext } from "../api/recovery";
import { submissionText } from "../utils/submission";
import { submissionExample, TIME_INPUT_GUIDE } from "../utils/submissionGuidance";

type Props = { room: Room; onAccessDenied: (error: ApiError) => void; onSaved: () => void; onPendingChange?: (pending: boolean) => void };

export default function ClarificationPanel(props: Props) {
  return <OwnClarification key={`${props.room.invite_code}:${viewerContext(props.room)}`} {...props} />;
}

function OwnClarification(props: Props) {
  const { room, onAccessDenied } = props;
  const client = useQueryClient();
  const key = ["clarifications", room.invite_code, viewerContext(room)];
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.getClarifications(room.invite_code, signal),
    enabled: room.viewer.joined && room.collection_status === "CLOSED",
    retry: false,
  });
  const question = query.data?.questions?.[0];
  const identity = question ? `${question.question_id}:${question.source_revision}:${room.revision_round?.id ?? "READ_ONLY"}` : null;
  const refetch = query.refetch;
  useEffect(() => () => {
    void client.cancelQueries({ queryKey: key, exact: true });
    client.removeQueries({ queryKey: key, exact: true });
    // Owner identity is the keyed component lifetime, independent of room polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (query.error instanceof ApiError && [401, 403].includes(query.error.status)) onAccessDenied(query.error);
  }, [query.error, onAccessDenied]);
  useEffect(() => {
    if (room.viewer.joined && room.collection_status === "CLOSED") void refetch();
  }, [room.state_version, room.analysis_id, room.revision_round?.id, room.viewer.joined, room.collection_status, refetch]);
  useEffect(() => { if (identity) setMessage(null); }, [identity]);

  if (query.isError) return null;
  if (question) return <QuestionClarification key={identity} {...props} question={question} stateVersion={query.data?.state_version ?? 0} onCompleted={setMessage} />;
  if (message) return <section className="glass-card side-card"><p role="status">{message}</p></section>;
  return null;
}

function QuestionClarification({ room, question, stateVersion, onAccessDenied, onSaved, onPendingChange, onCompleted }: Props & { question: ClarificationQuestion; stateVersion: number; onCompleted: (message: string) => void }) {
  const client = useQueryClient();
  const key = ["clarifications", room.invite_code, viewerContext(room)];
  const live = useRef(true);
  const saving = useRef(false);
  const operation = useRef<{ intent: string; body: ClarificationAnswer } | null>(null);
  const [choice, setChoice] = useState<"A" | "B" | "DIRECT" | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; onPendingChange?.(false); };
    // Question, source revision and editing round define this component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const editable = question.editable && correctionOpen(room) && !!room.capabilities?.can_edit_own_submission && !pending && !blocked;
  const replacement = submissionText(text);
  const valid = choice !== null && (choice !== "DIRECT" || replacement.valid);

  async function answer(selected: ClarificationAnswer["choice"]) {
    if (!editable || !question || !room.revision_round?.id || saving.current || (selected !== "CANCEL" && !valid)) return;
    saving.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    const payload = {
      revision_round_id: room.revision_round.id,
      expected_revision: question.source_revision,
      choice: selected,
      ...(selected === "DIRECT" ? { direct_text: replacement.text } : {}),
    };
    const intent = JSON.stringify(payload);
    if (operation.current?.intent !== intent) operation.current = { intent, body: { ...payload, request_id: crypto.randomUUID() } };
    try {
      const result = await api.answerClarification(room.invite_code, question.question_id, operation.current.body);
      if (!live.current) return;
      setText("");
      setChoice(null);
      void client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<ClarificationList>(key, { questions: [], state_version: stateVersion });
      onCompleted(result.status === "CANCELLED" ? "답변하지 않은 조건은 확정하지 않아요. 주최자가 재분석하기 전까지 기존 결과를 유지해요." : "답변을 새 입력으로 저장했어요. 주최자가 다시 분석하면 반영해요.");
      onSaved();
    } catch (failure) {
      if (!live.current) return;
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setText("");
        client.removeQueries({ queryKey: key, exact: true });
        onAccessDenied(failure);
      } else {
        setError(errorMessage(failure));
        if (failure instanceof ApiError && failure.status === 409) {
          setBlocked(true);
          void client.invalidateQueries({ queryKey: ["room", room.invite_code] });
          void client.invalidateQueries({ queryKey: ["submission", room.invite_code] });
          onSaved();
        }
      }
    } finally {
      if (live.current) { saving.current = false; setPending(false); onPendingChange?.(false); }
    }
  }

  if (denied) return null;
  return <section className="glass-card side-card clarification-panel">
    <h2>내 조건을 한 번 더 확인해 주세요</h2>
    <p className="submitted-text">{question.excerpt}</p>
    <fieldset disabled={!editable}>
      <legend>{question.question}</legend>
      <label><input type="radio" name="clarification" checked={choice === "A"} onChange={() => setChoice("A")} />{question.option_a}</label>
      <label><input type="radio" name="clarification" checked={choice === "B"} onChange={() => setChoice("B")} />{question.option_b}</label>
      <label><input type="radio" name="clarification" checked={choice === "DIRECT"} onChange={() => setChoice("DIRECT")} />직접 입력</label>
      {choice === "DIRECT" && <label className="field"><span>전체 조건을 다시 입력해 주세요</span><textarea rows={4} value={text} onChange={event => setText(event.target.value)} placeholder={submissionExample(room.meeting_mode)} aria-describedby="clarification-time-guide clarification-input-hint" /><small id="clarification-time-guide">{TIME_INPUT_GUIDE}</small><small id="clarification-input-hint">{replacement.length}/500 · ‘내일’ 같은 날짜는 이 답변을 저장한 날이 기준이에요.</small></label>}
    </fieldset>
    {!correctionOpen(room) && <p>주최자가 조건 수정을 열면 답변할 수 있어요.</p>}
    <p>답변하지 않아도 모호한 조건을 임의로 확정하지 않아요. 답변은 본인만 볼 수 있어요.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    <div className="submission-actions"><button className="button secondary" disabled={!editable} onClick={() => void answer("CANCEL")}>답변하지 않기</button><button className="button primary" disabled={!editable || !valid} onClick={() => void answer(choice ?? "DIRECT")}>{pending ? "저장 중…" : "답변 저장"}</button></div>
  </section>;
}
