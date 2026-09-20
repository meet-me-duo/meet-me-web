import type { ManualAvailability, Room } from "../api/types";

export const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
export const SLOT_COUNT = 48;

export interface TimeRow {
  key: string;
  label: string;
  kind: "DATED" | "WEEKLY";
  date?: string;
  dayOfWeek?: (typeof DAYS)[number];
}

export function roomRows(room: Room): TimeRow[] {
  if (room.search_range_source === "DEFAULTED") {
    return DAYS.map((dayOfWeek, index) => ({ key: dayOfWeek, label: `${DAY_LABELS[index]}요일`, kind: "WEEKLY", dayOfWeek }));
  }
  const rows: TimeRow[] = [];
  let cursor = parseDate(room.search_start_date);
  const end = parseDate(room.search_end_date);
  while (cursor < end) {
    const value = toDateKey(cursor);
    rows.push({ key: value, label: formatDate(value), kind: "DATED", date: value });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return rows;
}

export function selectionKey(rowKey: string, slot: number) {
  return `${rowKey}|${slot}`;
}

function minutesToTime(minutes: number, end = false): string {
  if (minutes >= 1_440) return end ? "23:59:59" : "23:30";
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

function timeToMinutes(time: string): number {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function selectionToAvailability(rows: TimeRow[], selected: Set<string>): ManualAvailability[] {
  const result: ManualAvailability[] = [];
  for (const row of rows) {
    const slots = Array.from({ length: SLOT_COUNT }, (_, index) => index).filter((index) => selected.has(selectionKey(row.key, index)));
    let start: number | null = null;
    for (let cursor = 0; cursor <= SLOT_COUNT; cursor += 1) {
      const active = slots.includes(cursor);
      if (active && start === null) start = cursor;
      if (!active && start !== null) {
        const common = { start_time: minutesToTime(start * 30), end_time: minutesToTime(cursor * 30, true) };
        result.push(row.kind === "DATED"
          ? { kind: "DATED", date: row.date!, day_of_week: null, ...common }
          : { kind: "WEEKLY", date: null, day_of_week: row.dayOfWeek!, ...common });
        start = null;
      }
    }
  }
  return result;
}

export function availabilityToSelection(rows: TimeRow[], availability: ManualAvailability[]): Set<string> {
  const selected = new Set<string>();
  for (const interval of availability) {
    const row = rows.find((item) => interval.kind === "DATED" ? item.date === interval.date : item.dayOfWeek === interval.day_of_week);
    if (!row) continue;
    const start = Math.floor(timeToMinutes(interval.start_time) / 30);
    const end = interval.end_time.startsWith("23:59") ? SLOT_COUNT : Math.ceil(timeToMinutes(interval.end_time) / 30);
    for (let slot = start; slot < end; slot += 1) selected.add(selectionKey(row.key, slot));
  }
  return selected;
}

export function slotLabel(slot: number): string {
  return minutesToTime(slot * 30);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" }).format(parseDate(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function localSeoulToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}:00+09:00`).toISOString();
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00+09:00`);
}

function toDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
