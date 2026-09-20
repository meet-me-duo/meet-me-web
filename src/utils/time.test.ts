import { describe, expect, it } from "vitest";
import type { Room } from "../api/types";
import { availabilityToSelection, roomRows, selectionKey, selectionToAvailability } from "./time";

function room(overrides: Partial<Room> = {}): Room {
  return {
    invite_code: "abcdefghijklmnopqrstuv",
    purpose: "테스트 모임",
    meeting_mode: "EITHER",
    time_zone_id: "Asia/Seoul",
    search_start_date: "2026-09-21",
    search_end_date: "2026-09-24",
    search_range_source: "HOST_SPECIFIED",
    expected_participants: null,
    submission_deadline: null,
    manual_only: true,
    collection_status: "COLLECTING",
    closure_reason: null,
    closed_at: null,
    public_status: "COLLECTING",
    viewer: { joined: true, display_name: "민수", role: "HOST" },
    input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
    ...overrides,
  };
}

describe("time grid conversion", () => {
  it("creates dated rows for a host-specified exclusive range", () => {
    expect(roomRows(room()).map((row) => row.key)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
  });

  it("creates Monday-to-Sunday rows for a default range", () => {
    expect(roomRows(room({ search_range_source: "DEFAULTED" }))).toHaveLength(7);
  });

  it("merges adjacent selected cells into one API interval", () => {
    const rows = roomRows(room());
    const selected = new Set([selectionKey(rows[0]!.key, 18), selectionKey(rows[0]!.key, 19), selectionKey(rows[0]!.key, 21)]);
    expect(selectionToAvailability(rows, selected)).toEqual([
      { kind: "DATED", date: "2026-09-21", day_of_week: null, start_time: "09:00", end_time: "10:00" },
      { kind: "DATED", date: "2026-09-21", day_of_week: null, start_time: "10:30", end_time: "11:00" },
    ]);
  });

  it("restores normalized API intervals into grid cells", () => {
    const rows = roomRows(room({ search_range_source: "DEFAULTED" }));
    const selected = availabilityToSelection(rows, [{ kind: "WEEKLY", date: null, day_of_week: "MONDAY", start_time: "18:00", end_time: "20:00" }]);
    expect(selected.has(selectionKey("MONDAY", 36))).toBe(true);
    expect(selected.has(selectionKey("MONDAY", 39))).toBe(true);
    expect(selected.has(selectionKey("MONDAY", 40))).toBe(false);
  });
});
