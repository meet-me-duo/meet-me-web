import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetRoom, readRecentRooms, RECENT_ROOMS_KEY, rememberRoom } from "./recentRooms";

const room = { invite_code: "abcdefghijklmnopqrstuv", purpose: "조사 모임", viewer: { joined: true } };
beforeEach(() => { localStorage.clear(); vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000); });
afterEach(() => vi.restoreAllMocks());

describe("device recent room addresses", () => {
  it("stores only a public address, short title and timestamp, never authority or conditions", () => {
    expect(rememberRoom({ ...room, purpose: "😀".repeat(100), viewer: { joined: true }, ...{ raw_text: "private", hostsecret: "secret", role: "HOST", credential: "credential" } })).toBe(true);
    const data = JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY)!);
    expect(Object.keys(data.rooms[0]).sort()).toEqual(["inviteCode", "lastOpenedAt", "title"]);
    expect(Array.from(data.rooms[0].title)).toHaveLength(80);
    expect(localStorage.getItem(RECENT_ROOMS_KEY)).not.toMatch(/private|secret|credential|HOST/);
  });
  it("does not record unjoined visits or unsafe links", () => {
    expect(rememberRoom({ ...room, viewer: { joined: false } })).toBe(false);
    expect(rememberRoom({ ...room, invite_code: "https://example.com" })).toBe(false);
    expect(readRecentRooms().rooms).toEqual([]);
  });
  it("deduplicates, orders most recent first and caps storage at ten", () => {
    for (let i = 0; i < 12; i++) { vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + i); rememberRoom({ ...room, invite_code: `room${String(i).padStart(18, "0")}` }); }
    expect(readRecentRooms().rooms).toHaveLength(10);
    const latest = readRecentRooms().rooms[0]!;
    expect(latest.inviteCode).toBe("room000000000000000011");
    rememberRoom({ ...room, invite_code: latest.inviteCode, purpose: "변경된 제목" });
    expect(readRecentRooms().rooms).toHaveLength(10);
    expect(readRecentRooms().rooms[0]!.title).toBe("변경된 제목");
    expect(JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY)!).rooms).toHaveLength(10);
  });
  it("expires history after thirty days independently of cookie validity", () => {
    rememberRoom(room);
    vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + 30 * 86_400_000);
    expect(readRecentRooms().rooms).toEqual([]);
  });
  it("ignores corrupt, future-version and invalid records and strips extra fields", () => {
    localStorage.setItem(RECENT_ROOMS_KEY, "{broken");
    expect(readRecentRooms()).toEqual({ rooms: [], unavailable: false });
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify({ version: 2, rooms: [] }));
    expect(readRecentRooms().rooms).toEqual([]);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify({ version: 1, rooms: [
      { inviteCode: room.invite_code, title: "정상", lastOpenedAt: Date.now(), role: "HOST", hostsecret: "secret" },
      { inviteCode: "javascript:alert(1)", title: "bad", lastOpenedAt: Date.now() },
      { inviteCode: "ABCDEFGHIJKLMNOPQRSTUV", title: "future", lastOpenedAt: Date.now() + 1 },
    ] }));
    expect(readRecentRooms().rooms).toEqual([{ inviteCode: room.invite_code, title: "정상", lastOpenedAt: Date.now() }]);
  });
  it("handles rejected reads and writes without throwing or claiming success", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    expect(readRecentRooms()).toEqual({ rooms: [], unavailable: true });
    expect(rememberRoom(room)).toBe(false);
    get.mockRestore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(rememberRoom(room)).toBe(false);
    expect(forgetRoom(room.invite_code)).toBe(false);
  });
  it("removes only the selected local address", () => {
    rememberRoom(room);
    rememberRoom({ ...room, invite_code: "ABCDEFGHIJKLMNOPQRSTUV" });
    expect(forgetRoom(room.invite_code)).toBe(true);
    expect(readRecentRooms().rooms.map(item => item.inviteCode)).toEqual(["ABCDEFGHIJKLMNOPQRSTUV"]);
  });
});
