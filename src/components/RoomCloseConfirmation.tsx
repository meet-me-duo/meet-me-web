import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./ui/button";

/** A local confirmation only; the caller retains HOST authorization and the request lock. */
export function RoomCloseConfirmation({ disabled, pending, error, unsaved = false, onConfirm }: {
  disabled: boolean;
  pending: boolean;
  error?: string;
  unsaved?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const returnFocus = trigger.current;
    if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (element.open && typeof element.close === "function") element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [open]);
  const close = () => { if (!pending) setOpen(false); };
  const keyboard = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <>
    <Button ref={trigger} variant="danger-outline" disabled={disabled} onClick={() => setOpen(true)}>{pending ? "마감 중…" : "입력 마감하기"}</Button>
    {!open && error && <p className="alert error" role="alert">{error}</p>}
    {open && <dialog ref={dialog} className="room-close-dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending}
      onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard}>
      <div className="room-close-content"><h2 id={`${id}-title`}>지금 입력을 마감할까요?</h2>
        <div id={`${id}-description`}><p>자동 마감 조건 전이라도 현재 입력 수집을 끝내요. 확인 중이거나 미제출인 입력은 이번 결과에 포함되지 않을 수 있어요.</p>
          <p>제출을 완료한 참여자가 2명 미만이면 분석은 시작되지 않아요.</p>
          {unsaved && <p className="alert warning">이 화면에 저장하지 않은 수정 내용이 있어요. 이 수정은 이번 결과에 포함되지 않아요.</p>}</div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="room-close-actions"><Button variant="secondary" disabled={pending} onClick={close}>돌아가기</Button><Button variant="danger-outline" disabled={disabled || pending} onClick={onConfirm}>{pending ? "마감 중…" : "지금 입력 마감"}</Button></div>
      </div>
    </dialog>}
  </>;
}
