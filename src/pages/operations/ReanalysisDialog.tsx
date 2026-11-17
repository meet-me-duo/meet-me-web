import { useEffect, useId, useRef, type KeyboardEvent } from "react";
export function ReanalysisDialog({ title, returnFocusTo, onCancel, onConfirm }: {
  title: string; returnFocusTo: HTMLButtonElement; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const node = dialog.current; if (!node) return;
    if (typeof node.showModal === "function") node.showModal(); else node.setAttribute("open", "");
    cancel.current?.focus();
    return () => { if (node.open && typeof node.close === "function") node.close(); if (returnFocusTo.isConnected) returnFocusTo.focus(); };
  }, [returnFocusTo]);
  function keyboard(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    if (event.key === "Tab") {
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
  }
  return <dialog ref={dialog} className="ops-dialog" aria-modal="true" aria-labelledby={id} onCancel={event => { event.preventDefault(); onCancel(); }} onKeyDown={keyboard}>
    <h2 id={id}>이 모임을 다시 분석할까요?</h2><p className="ops-modal-room">{title}</p>
    <p>저장된 입력과 보완 답변으로 최신 분석을 실행해요. 이전 기록은 보존되고, 완료 후 새 결과가 이용자 모임 화면에 표시돼요.</p>
    <div className="ops-dialog-actions"><button ref={cancel} className="ops-button" onClick={onCancel}>취소</button><button className="ops-button ops-primary" onClick={onConfirm}>다시 분석</button></div>
  </dialog>;
}
