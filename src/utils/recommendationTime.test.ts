import { describe, expect, it } from "vitest";
import { formatRecommendationRange, localDateTimeInstants, sameRecommendationInstant, validateSelection } from "./recommendationTime";

// #19: actual meeting instants must be chosen inside one offered variant.
const range = {
  id: "variant-seoul", startAt: "2026-10-08T01:00:00Z", endAt: "2026-10-08T05:00:00Z",
  attendanceCount: 3, totalParticipants: 4, meetingMode: "IN_PERSON" as const, place: "강남",
};

describe("#19 recommendation time conversion", () => {
  it("converts a Seoul wall time to its actual instant", () => {
    expect(localDateTimeInstants("2026-10-08T10:30", "Asia/Seoul")).toEqual(["2026-10-08T01:30:00.000Z"]);
  });
  it("does not use the browser timezone for the room timezone", () => {
    expect(localDateTimeInstants("2026-10-08T10:30", "UTC")).toEqual(["2026-10-08T10:30:00.000Z"]);
  });
  it("rejects a wall time that does not exist during spring DST", () => {
    expect(localDateTimeInstants("2026-03-08T02:30", "America/New_York")).toEqual([]);
  });
  it("returns both real instants for an overlapping fall DST wall time", () => {
    expect(localDateTimeInstants("2026-11-01T01:30", "America/New_York")).toEqual([
      "2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z",
    ]);
  });
  it("handles a non-hour DST overlap without assuming a one-hour change", () => {
    expect(localDateTimeInstants("2026-04-05T01:45", "Australia/Lord_Howe")).toEqual([
      "2026-04-04T14:45:00.000Z", "2026-04-04T15:15:00.000Z",
    ]);
  });
  it.each(["", "2026-02-30T10:30", "2026-10-08T25:00", "invalid"])("rejects invalid datetime input %s", value => {
    expect(localDateTimeInstants(value, "Asia/Seoul")).toEqual([]);
  });
});

describe("#19 available range validation", () => {
  it("accepts selecting the whole offered range without inventing a duration", () => {
    expect(validateSelection(range.startAt, range.endAt, range)).toBe(true);
  });
  it("accepts a short positive interval strictly inside the range", () => {
    expect(validateSelection("2026-10-08T01:10:00Z", "2026-10-08T01:25:00Z", range)).toBe(true);
  });
  it.each([
    ["2026-10-08T00:59:00Z", "2026-10-08T02:00:00Z"],
    ["2026-10-08T02:00:00Z", "2026-10-08T05:01:00Z"],
    ["2026-10-08T02:00:00Z", "2026-10-08T02:00:00Z"],
    ["2026-10-08T03:00:00Z", "2026-10-08T02:00:00Z"],
    ["", "2026-10-08T02:00:00Z"],
    ["invalid", "2026-10-08T02:00:00Z"],
  ])("rejects invalid or out-of-range interval %s → %s", (start, end) => {
    expect(validateSelection(start, end, range)).toBe(false);
  });
  it("compares instants rather than the lexical strings of different offsets", () => {
    expect(validateSelection("2026-10-08T10:30:00+09:00", "2026-10-08T12:00:00+09:00", range)).toBe(true);
  });
  it("rejects a whole-second start that precedes a microsecond-precision offered boundary", () => {
    const preciseRange = { ...range, startAt: "2026-10-08T01:00:00.000001Z" };
    expect(validateSelection("2026-10-08T01:00:00Z", "2026-10-08T02:00:00Z", preciseRange)).toBe(false);
  });
});

describe("#19 recommendation range display", () => {
  it("shows both dates for a range that crosses midnight", () => {
    const label = formatRecommendationRange("2026-10-08T14:00:00Z", "2026-10-08T17:00:00Z", "Asia/Seoul");
    expect(label).toMatch(/10\D{0,3}0?8/);
    expect(label).toMatch(/10\D{0,3}0?9/);
    expect(label).toContain("23:00");
    expect(label).toContain("02:00");
    expect(label).toMatch(/UTC\+0?9(?::00)?/);
  });
  it("distinguishes two identical fall DST wall times by their offsets", () => {
    const label = formatRecommendationRange("2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "America/New_York");
    expect(label).toContain("01:30");
    expect(label).toMatch(/UTC-0?4(?::00)?/);
    expect(label).toMatch(/UTC-0?5(?::00)?/);
  });
  it("preserves both microsecond boundaries when displaying a saved selected interval", () => {
    const label = formatRecommendationRange("2026-10-08T01:00:00.000001Z", "2026-10-08T01:00:00.000002Z", "Asia/Seoul");
    expect(label).toContain("10:00:00.000001");
    expect(label).toContain("10:00:00.000002");
  });
});

describe("#19 full selection tuple instant equality", () => {
  it("accepts equivalent millisecond and microsecond ISO representations", () => {
    expect(sameRecommendationInstant("2026-10-08T01:30:00.000Z", "2026-10-08T01:30:00.000000Z")).toBe(true);
  });
  it("accepts equivalent ISO timestamps with different timezone offsets", () => {
    expect(sameRecommendationInstant("2026-10-08T01:30:00.000Z", "2026-10-08T10:30:00+09:00")).toBe(true);
  });
  it("distinguishes actual instants that differ by one microsecond", () => {
    expect(sameRecommendationInstant("2026-10-08T01:30:00.000001Z", "2026-10-08T01:30:00.000002Z")).toBe(false);
  });
  it("never treats two invalid or missing timestamps as the same instant", () => {
    expect(sameRecommendationInstant("", "")).toBe(false);
    expect(sameRecommendationInstant("invalid", "invalid")).toBe(false);
  });
});
