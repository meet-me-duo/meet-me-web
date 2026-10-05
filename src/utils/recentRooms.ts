import type { Room } from "../api/types";

export const RECENT_ROOMS_KEY = "meet-me:recent-rooms:v1";
export const RECENT_ROOMS_EVENT = "meet-me:recent-rooms-changed";
export const RECENT_ROOMS_LIMIT = 10;
const RETENTION_MS = 30 * 86_400_000;
const VALID_CODE = /^[A-Za-z0-9_-]{22}$/;

export type RecentRoom = { inviteCode: string; title: string; lastOpenedAt: number };
export type RecentRooms = { rooms: RecentRoom[]; unavailable: boolean };

export function readRecentRooms(): RecentRooms {
  try {
    const raw = window.localStorage.getItem(RECENT_ROOMS_KEY);
    if (!raw) return { rooms: [], unavailable: false };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("rooms" in data) || !Array.isArray(data.rooms)) return { rooms: [], unavailable: false };
    const now = Date.now();
    const seen = new Set<string>();
    const rooms: RecentRoom[] = [];
    for (const value of data.rooms) {
      if (!value || typeof value !== "object" || typeof value.inviteCode !== "string" || !VALID_CODE.test(value.inviteCode) || typeof value.title !== "string" || typeof value.lastOpenedAt !== "number" || !Number.isFinite(value.lastOpenedAt) || value.lastOpenedAt <= now - RETENTION_MS || value.lastOpenedAt > now) continue;
      // Read only public address metadata, even if extra fields were inserted into storage.
      rooms.push({ inviteCode: value.inviteCode, title: Array.from(value.title).slice(0, 80).join(""), lastOpenedAt: value.lastOpenedAt });
    }
    return { rooms: rooms.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).filter(room => { if (seen.has(room.inviteCode)) return false; seen.add(room.inviteCode); return true; }).slice(0, RECENT_ROOMS_LIMIT), unavailable: false };
  } catch (error) {
    return { rooms: [], unavailable: !(error instanceof SyntaxError) };
  }
}

function writeRecentRooms(rooms: RecentRoom[]): boolean {
  try {
    window.localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify({ version: 1, rooms }));
    window.dispatchEvent(new Event(RECENT_ROOMS_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function rememberRoom(room: Pick<Room, "invite_code" | "purpose"> & { viewer: { joined: boolean } }): boolean {
  if (!room.viewer.joined || !VALID_CODE.test(room.invite_code)) return false;
  const current = readRecentRooms();
  if (current.unavailable) return false;
  return writeRecentRooms([
    { inviteCode: room.invite_code, title: Array.from(room.purpose.trim()).slice(0, 80).join(""), lastOpenedAt: Date.now() },
    ...current.rooms.filter(item => item.inviteCode !== room.invite_code),
  ].slice(0, RECENT_ROOMS_LIMIT));
}

export function forgetRoom(inviteCode: string): boolean {
  const current = readRecentRooms();
  return !current.unavailable && writeRecentRooms(current.rooms.filter(room => room.inviteCode !== inviteCode));
}

export function roomLink(inviteCode: string): string {
  return `${window.location.origin}/rooms/${inviteCode}`;
}
