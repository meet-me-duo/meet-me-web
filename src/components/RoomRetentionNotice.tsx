import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccountRoomPage } from "../api/accountRooms";
import { roomRetentionLabel } from "../utils/roomRetention";

/** RoomResponse has no retention timestamps. Reuse matching account-list evidence without another API request. */
export function RoomRetentionNotice({ inviteCode }: { inviteCode: string }) {
  const client = useQueryClient();
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client]);
  const snapshot = useCallback(() => {
    const matches = new Set<string>();
    for (const [, data] of client.getQueriesData<{ pages: AccountRoomPage[] }>({ queryKey: ["account-rooms"] })) {
      for (const page of Array.isArray(data?.pages) ? data.pages : []) for (const row of Array.isArray(page?.rooms) ? page.rooms : []) {
        if (row?.invite_code === inviteCode && typeof row.created_at === "string" && typeof row.expires_at === "string" && roomRetentionLabel(row.created_at, row.expires_at) !== null) matches.add(JSON.stringify([row.created_at, row.expires_at]));
      }
    }
    return matches.size === 1 ? [...matches][0] : "";
  }, [client, inviteCode]);
  const evidence = useSyncExternalStore(subscribe, snapshot, () => "");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!evidence) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [evidence]);
  if (!evidence) return null;
  const [createdAt, expiresAt] = JSON.parse(evidence) as [string, string];
  const label = roomRetentionLabel(createdAt, expiresAt, now);
  if (!label) return null;
  return <p className="room-retention-hint" title="생성일 기준 30일 후 자동 정리 · 한국 시간 날짜 기준"><time dateTime={expiresAt}>{label}</time></p>;
}
