import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, UserRound, X } from "lucide-react";
import { Button } from "../components/ui/button";

function nameError(value: string): string | null {
  if (/\p{Cc}/u.test(value) || Array.from(value).some(character => { const point = character.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff; })) return "사용할 수 없는 문자가 포함되어 있어요.";
  const length = Array.from(value.trim()).length;
  if (!length) return "닉네임을 입력해 주세요.";
  return length > 50 ? "닉네임은 50자까지 입력할 수 있어요." : null;
}

/** The caller owns saving and the account session boundary. */
export function NicknameEditDialog({ displayName, returnFocusTo, onCancel, onSave }: {
  displayName: string;
  returnFocusTo: HTMLButtonElement | null;
  onCancel: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(displayName);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const invalid = nameError(value);
  const changed = value.trim() !== displayName;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    input.current?.focus();
    input.current?.select();
    return () => {
      if (element.open && typeof element.close === "function") element.close();
      if (returnFocusTo?.isConnected) returnFocusTo.focus();
    };
  }, [returnFocusTo]);
  useEffect(() => {
    if (pending) dialog.current?.focus();
    else if (document.activeElement === dialog.current) input.current?.focus();
  }, [pending]);
  const close = () => { if (!locked.current) onCancel(); };
  const keyboard = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const elements = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)") ?? [])];
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <dialog ref={dialog} tabIndex={-1} className="room-close-dialog nickname-dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard}>
    <form className="nickname-dialog-content" onSubmit={event => {
      event.preventDefault();
      if (locked.current || invalid || !changed) return;
      locked.current = true; setPending(true); setFailure(null);
      void onSave(value.trim()).catch(() => { setFailure("닉네임 저장을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."); }).finally(() => { locked.current = false; setPending(false); });
    }}>
      <button type="button" className="nickname-close" aria-label="닉네임 변경 닫기" disabled={pending} onClick={close}><X size={20} aria-hidden="true" /></button>
      <span className="nickname-dialog-icon"><UserRound size={22} aria-hidden="true" /></span>
      <h2 id={`${id}-title`}>닉네임 변경</h2>
      <p id={`${id}-description`} className="nickname-description">Meet me에서 사용할 이름을 바꿔보세요.</p>
      <label className="field nickname-field" htmlFor={`${id}-name`}><span>닉네임</span>
        <input ref={input} id={`${id}-name`} autoComplete="nickname" value={value} disabled={pending} aria-invalid={touched && !!invalid} aria-describedby={`${id}-hint ${id}-count`} onChange={event => { setValue(event.target.value); setTouched(true); setFailure(null); }} />
      </label>
      <div className="nickname-field-footer"><span id={`${id}-hint`} aria-live="polite" className={touched && invalid ? "nickname-field-error" : "nickname-field-hint"}>{touched && invalid ? invalid : "1~50자로 입력해 주세요."}</span><span id={`${id}-count`} className="nickname-count">{Array.from(value.trim()).length}/50</span></div>
      <p className="nickname-scope"><Check size={15} aria-hidden="true" /><span>이미 참여한 모임의 이름은 그대로 유지돼요.</span></p>
      {failure && <p className="alert error nickname-save-error" role="alert">{failure}</p>}
      <div className="nickname-actions"><Button variant="secondary" disabled={pending} onClick={close}>취소</Button><Button type="submit" disabled={pending || !!invalid || !changed}>{pending ? "저장 중…" : "저장"}</Button></div>
    </form>
  </dialog>;
}
