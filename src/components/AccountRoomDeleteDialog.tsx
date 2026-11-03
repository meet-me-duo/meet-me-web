import { useEffect, useId, useRef, type KeyboardEvent, type RefObject } from "react";
import { Button } from "./ui/button";

export function AccountRoomDeleteDialog({ purpose, pending, error, returnFocusTo, fallbackFocus, onCancel, onConfirm }: {
  purpose: string;
  pending: boolean;
  error: string | null;
  returnFocusTo: HTMLButtonElement;
  fallbackFocus: RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    cancel.current?.focus();
    const fallback = fallbackFocus.current;
    return () => {
      if (element.open && typeof element.close === "function") element.close();
      const target = returnFocusTo.isConnected ? returnFocusTo : fallback;
      if (target?.isConnected) target.focus();
    };
  }, [returnFocusTo, fallbackFocus]);
  useEffect(() => {
    if (pending) dialog.current?.focus();
    else if (document.activeElement === dialog.current) cancel.current?.focus();
  }, [pending]);
  const close = () => { if (!pending) onCancel(); };
  const keyboard = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <dialog ref={dialog} tabIndex={-1} className="room-close-dialog account-room-delete-dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard}>
    <div className="room-close-content"><h2 id={`${id}-title`}>내 목록에서 삭제할까요?</h2>
      <p className="account-room-delete-purpose"><strong>{purpose}</strong></p>
      <div id={`${id}-description`}><p>내 목록에서만 삭제되며 되돌릴 수 없어요.</p><p>모임 자체와 다른 참여자의 목록, 기존 참여 및 직접 링크에는 영향이 없어요.</p></div>
      {error && <p className="alert error" role="alert">{error}</p>}
      <div className="room-close-actions"><Button ref={cancel} variant="secondary" disabled={pending} onClick={close}>취소</Button><Button variant="danger-outline" disabled={pending} onClick={onConfirm}>{pending ? "삭제 중…" : "내 목록에서 삭제"}</Button></div>
    </div>
  </dialog>;
}
