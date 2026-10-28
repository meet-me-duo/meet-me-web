import type { components, operations } from "./schema";

export type AccountRoomRole = NonNullable<components["schemas"]["AccountRoomResponse"]["role"]>;
export interface AccountRoomRecord { invite_code: string; purpose: string; created_at: string; expires_at: string; role?: AccountRoomRole }
export interface AccountRoomsResponse { rooms: AccountRoomRecord[]; has_more?: boolean; next_cursor?: string | null }
export type AccountRoomFilters = Omit<NonNullable<operations["accountRooms"]["parameters"]["query"]>, "cursor">;
export interface AccountRoomPage { kind: "history" | "legacy"; rooms: (AccountRoomRecord & { role: AccountRoomRole })[]; has_more: boolean; next_cursor: string | null }

export function accountRoomsPath(filters: AccountRoomFilters = {}, cursor?: string) {
  const query = new URLSearchParams();
  if (filters.role) query.set("role", filters.role);
  if (filters.created_from) query.set("created_from", filters.created_from);
  if (filters.created_to) query.set("created_to", filters.created_to);
  if (filters.query?.trim()) query.set("query", filters.query.trim());
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/api/account/rooms${query.size ? `?${query}` : ""}`;
}

export function decodeAccountRooms(value: unknown): AccountRoomPage {
  const invalid = () => new Error("모임 목록 형식을 확인하지 못했어요. 잠시 후 다시 조회해 주세요.");
  if (!value || typeof value !== "object" || !("rooms" in value) || !Array.isArray(value.rooms)) throw invalid();
  const history = "has_more" in value || "next_cursor" in value || value.rooms.some(row => row && typeof row === "object" && "role" in row);
  let hasMore = false; let nextCursor: string | null = null;
  if (history) {
    if (!("has_more" in value) || typeof value.has_more !== "boolean" || !("next_cursor" in value)
      || !(value.next_cursor === null || typeof value.next_cursor === "string" && value.next_cursor.length > 0 && value.next_cursor.length <= 200)
      || value.has_more !== (value.next_cursor !== null)) throw invalid();
    hasMore = value.has_more; nextCursor = value.next_cursor;
  }
  const rooms = value.rooms.map((row: unknown) => {
    if (!row || typeof row !== "object") throw invalid();
    const item = row as Record<string, unknown>;
    if (typeof item.invite_code !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(item.invite_code)
      || typeof item.purpose !== "string" || typeof item.created_at !== "string" || !Number.isFinite(Date.parse(item.created_at))
      || typeof item.expires_at !== "string" || !Number.isFinite(Date.parse(item.expires_at))
      || history && item.role !== "HOST" && item.role !== "MEMBER") throw invalid();
    return { invite_code: item.invite_code, purpose: item.purpose, created_at: item.created_at, expires_at: item.expires_at, role: (history ? item.role : "HOST") as AccountRoomRole };
  });
  return { kind: history ? "history" : "legacy", rooms, has_more: hasMore, next_cursor: nextCursor };
}
