import { describe, expect, it } from "vitest";
import { accountRoomsPath, decodeAccountRooms } from "./accountRooms";

const room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "합성 모임", created_at: "2026-10-27T15:00:00Z", expires_at: "2026-11-27T15:00:00Z" };
describe("account history wire contract", () => {
  it("preserves the query-free default and encodes filters/cursor without changing date boundaries", () => {
    expect(accountRoomsPath()).toBe("/api/account/rooms");
    const url = new URL(accountRoomsPath({ role: "MEMBER", created_from: "2026-10-28", created_to: "2026-10-28", query: "  팀 %_ 모임  ", limit: 20 }, "opaque+/_=cursor"), "http://local.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ role: "MEMBER", created_from: "2026-10-28", created_to: "2026-10-28", query: "팀 %_ 모임", limit: "20", cursor: "opaque+/_=cursor" });
    expect(accountRoomsPath({ query: "  " })).toBe("/api/account/rooms");
    expect(new URL(accountRoomsPath({ created_to: "2026-10-28" }), "http://local.test").searchParams.has("created_from")).toBe(false);
  });
  it("distinguishes full account history from the old HOST-only archive", () => {
    expect(decodeAccountRooms({ rooms: [room] })).toEqual({ kind: "legacy", rooms: [{ ...room, role: "HOST" }], has_more: false, next_cursor: null });
    const page = decodeAccountRooms({ rooms: [{ ...room, role: "MEMBER", private_raw: "must not copy" }], has_more: true, next_cursor: "opaque" });
    expect(page.kind).toBe("history"); expect(page.rooms[0]!.role).toBe("MEMBER"); expect(page.next_cursor).toBe("opaque");
    expect(page.rooms[0]).not.toHaveProperty("private_raw");
    expect(decodeAccountRooms({ rooms: [], has_more: false, next_cursor: null }).kind).toBe("history");
  });
  it.each([
    { rooms: [{ ...room, role: "ADMIN" }], has_more: false, next_cursor: null },
    { rooms: [room], has_more: false, next_cursor: null },
    { rooms: [{ ...room, role: "HOST" }], has_more: true, next_cursor: null },
    { rooms: [{ ...room, role: "HOST" }], has_more: false, next_cursor: "stale" },
    { rooms: [{ ...room, role: "HOST" }], has_more: true, next_cursor: "" },
    { rooms: [{ ...room, role: "HOST", invite_code: "//other-account" }], has_more: false, next_cursor: null },
    { rooms: [{ ...room, role: "HOST", created_at: "invalid" }], has_more: false, next_cursor: null },
  ])("rejects malformed role, paging or row data instead of showing a misleading list %#", body => {
    expect(() => decodeAccountRooms(body)).toThrow("모임 목록 형식을 확인하지 못했어요");
  });
});
