import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ApiError } from "../../api/client";
import { getSessionVersion, subscribeSession } from "../../auth/session";
import { reviewApi, type ReviewAnswer, type ReviewReceipt } from "./api";
import "./review.css";

const choices = [
  "불편한 점 없이 잘 이용했어요",
  "AI가 제가 입력한 조건을 잘못 이해했어요",
  "추천된 시간 중 마음에 드는 선택지가 없었어요",
  "응답이 느리거나 오류가 났어요",
  "기타",
];

/** Mount only once an authorized viewer's confirmed result has loaded successfully. */
export function ReviewPrompt({ inviteCode, viewerKey, enabled = true }: { inviteCode: string; viewerKey: string; enabled?: boolean }) {
  const epoch = useSyncExternalStore(subscribeSession, getSessionVersion, getSessionVersion);
  const [pageEpoch, setPageEpoch] = useState(0);
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setPageEpoch(current => current + 1); };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  return enabled ? <ReviewScreen key={`${inviteCode}:${viewerKey}:${epoch}:${pageEpoch}`} inviteCode={inviteCode} /> : null;
}

function ReviewScreen({ inviteCode }: { inviteCode: string }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const claim = useRef<Promise<ReviewReceipt> | null>(null);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [hideForWeek, setHideForWeek] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState<ReviewAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeRetry, setCloseRetry] = useState<{ id: string; hide: boolean } | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const codePoints = [...text].length;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    claim.current ??= reviewApi.claim(inviteCode, requestId);
    void claim.current.then(receipt => {
      if (active && receipt.state === "PENDING" && receipt.prompt_id) setPromptId(receipt.prompt_id);
    }).catch(() => { /* The confirmed result remains available when optional review loading fails. */ });
    return () => { active = false; mounted.current = false; };
  }, [inviteCode, requestId]);

  useEffect(() => {
    const element = dialog.current;
    if (!promptId || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    element.querySelector<HTMLInputElement>("input")?.focus();
    return () => { if (element.open && typeof element.close === "function") element.close(); previous?.focus(); };
  }, [promptId]);

  function toggle(value: number) {
    setSelected(current => current.includes(value) ? current.filter(item => item !== value) : value === 1 ? [1] : [...current.filter(item => item !== 1), value].sort());
  }

  async function saveClose(id: string, hide: boolean) {
    try {
      const receipt = await reviewApi.close(inviteCode, id, hide);
      if (!mounted.current) return;
      setCloseRetry(null);
      setNotice(receipt.state === "SUBMITTED" ? "의견이 접수됐어요. 감사합니다." : hide ? "일주일간 리뷰 요청을 숨겼어요." : null);
    } catch {
      if (!mounted.current || !hide) return;
      setNotice("이 화면에서는 닫았어요. 일주일 숨김 저장은 확인하지 못했어요.");
      setCloseRetry({ id, hide });
    } finally { if (mounted.current) locked.current = false; }
  }

  function close() {
    if (!promptId || locked.current) return;
    locked.current = true;
    const id = promptId;
    setPromptId(null);
    void saveClose(id, hideForWeek);
  }

  async function submit() {
    if (!promptId || locked.current || selected.length === 0 || (selected.includes(5) && codePoints > 2000)) return;
    locked.current = true; setBusy(true); setError(null);
    const answer = attempted ?? { choices: selected, other_text: selected.includes(5) && text.trim() ? text : null };
    setAttempted(answer);
    try {
      const receipt = await reviewApi.submit(inviteCode, promptId, answer);
      if (!mounted.current) return;
      setPromptId(null);
      setNotice(receipt.state === "SUBMITTED" ? "의견이 접수됐어요. 감사합니다." : "리뷰 요청이 종료됐어요.");
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && [401, 403, 404, 409].includes(failure.status)) {
        setPromptId(null); setText(""); setSelected([]); setAttempted(null);
        setNotice("리뷰 요청 상태가 바뀌었어요. 확정 결과는 계속 확인할 수 있어요.");
      } else {
        if (failure instanceof ApiError && failure.status === 400) setAttempted(null);
        setError("접수를 확인하지 못했어요. 같은 의견으로 다시 제출하거나 닫을 수 있어요.");
      }
    } finally { if (mounted.current) { locked.current = false; setBusy(false); } }
  }

  function keyboard(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)") ?? [])];
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <>
    {notice && <div className="meetme-review-notice" role="status">{notice}{closeRetry && <button type="button" onClick={() => {
      if (locked.current) return; locked.current = true; void saveClose(closeRetry.id, closeRetry.hide);
    }}>숨김 다시 저장</button>}</div>}
    {promptId && <dialog ref={dialog} className="meetme-review" aria-modal="true" aria-labelledby="meetme-review-title" aria-describedby="meetme-review-description"
      onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard}>
      <h2 id="meetme-review-title">이번 모임 조율은 어땠나요?</h2>
      <p id="meetme-review-description">의견을 들려주시면 더 편한 조율을 만드는 데 도움이 돼요.</p>
      <fieldset disabled={busy || attempted !== null}>
        <legend>해당하는 항목을 선택해 주세요</legend>
        <div className="meetme-review-choices">{choices.map((label, index) => <label key={label}>
          <input type="checkbox" checked={selected.includes(index + 1)} onChange={() => toggle(index + 1)} />
          <span>{label}</span>
        </label>)}</div>
        <p className="meetme-review-hint">불편했던 점은 여러 개 선택할 수 있어요.</p>
        {selected.includes(5) && <label className="meetme-review-text">더 들려주고 싶은 의견 (선택)
          <textarea value={text} onChange={event => setText(event.target.value)} rows={3} aria-describedby="meetme-review-text-hint" aria-invalid={codePoints > 2000} />
          <span id="meetme-review-text-hint">개인정보는 적지 말아 주세요. {codePoints}/2000자</span>
        </label>}
      </fieldset>
      {error && <p className="meetme-review-error" role="alert">{error}</p>}
      <div className="meetme-review-submit"><button type="button" disabled={busy || selected.length === 0 || (selected.includes(5) && codePoints > 2000)} onClick={() => void submit()}>{busy ? "보내는 중…" : attempted ? "다시 제출" : "의견 보내기"}</button></div>
      <div className="meetme-review-footer"><label><input type="checkbox" checked={hideForWeek} disabled={busy} onChange={event => setHideForWeek(event.target.checked)} />일주일간 보지 않기</label>
        <button type="button" disabled={busy} onClick={close}>닫기</button></div>
    </dialog>}
  </>;
}
