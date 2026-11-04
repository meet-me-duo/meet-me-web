import { useEffect, useReducer } from "react";
import { roomRetentionLabel } from "../utils/roomRetention";

/** The room response owns the retention deadline, independently of account history. */
export function RoomRetentionNotice({ expiresAt }: { expiresAt: unknown }) {
  const [, refreshClock] = useReducer((value: number) => value + 1, 0);
  const label = roomRetentionLabel(expiresAt);
  useEffect(() => {
    if (typeof expiresAt !== "string" || roomRetentionLabel(expiresAt) === null) return;
    let timer: number;
    const schedule = () => {
      const now = Date.now();
      const nextMinute = (Math.floor(now / 60_000) + 1) * 60_000;
      const expires = Date.parse(expiresAt);
      const next = Math.min(nextMinute, expires > now ? expires : Infinity);
      timer = window.setTimeout(() => { refreshClock(); schedule(); }, Math.max(1, next - now));
    };
    const update = () => { refreshClock(); window.clearTimeout(timer); schedule(); };
    schedule();
    document.addEventListener("visibilitychange", update);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", update); };
  }, [expiresAt]);
  if (!label || typeof expiresAt !== "string") return null;
  return <p className="room-retention-hint" title="생성일 기준 30일 보관 · 한국 시간 날짜 기준 · 실제 정리 시점은 다를 수 있어요."><time dateTime={expiresAt}>{label}</time></p>;
}
