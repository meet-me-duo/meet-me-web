import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomBody, createRoomSchema, defaultSearchDates, exclusiveSearchEnd, type CreateRoomValues } from "./createRoom";

const base: CreateRoomValues = { hostName: " 민수 ", purpose: " 모임 ", meetingMode: "EITHER", customSearch: false, searchStart: "", searchEnd: "", useExpected: true, expectedParticipants: "4", useDeadline: false, deadline: "", manualOnly: false };
afterEach(() => vi.useRealTimers());

describe("creation date contract", () => {
  it("preserves null/null for the default, including stale custom fields", () => {
    expect(createRoomBody({ ...base, searchStart: "2026-10-01", searchEnd: "2026-10-05" })).toMatchObject({ search_start_date: null, search_end_date: null });
  });
  it.each([
    ["2026-01-31", "2026-01-31", "2026-02-01"],
    ["2026-12-31", "2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29", "2028-03-01"],
    ["2026-01-01", "2026-01-31", "2026-02-01"],
    ["2026-10-01", "2026-10-14", "2026-10-15"],
  ])("includes %s through %s, sends exclusive %s", (searchStart, searchEnd, exclusive) => {
    const value = { ...base, customSearch: true, searchStart, searchEnd };
    expect(createRoomSchema.safeParse(value).success).toBe(true);
    expect(createRoomBody(value)).toMatchObject({ search_start_date: searchStart, search_end_date: exclusive });
    expect((Date.parse(exclusive) - Date.parse(searchStart)) / 86_400_000).toBe((Date.parse(searchEnd) - Date.parse(searchStart)) / 86_400_000 + 1);
  });
  it.each([
    ["2026-01-01", "2026-02-01"], ["2026-01-02", "2026-01-01"],
    ["2026-02-30", "2026-03-02"], ["2027-02-29", "2027-03-02"],
    ["2026-01-01", ""], ["", "2026-01-01"], ["invalid", "invalid"],
  ])("rejects invalid or more than 31 days: %s through %s", (searchStart, searchEnd) => {
    expect(createRoomSchema.safeParse({ ...base, customSearch: true, searchStart, searchEnd }).success).toBe(false);
  });
  it.each([
    ["2026-12-31T14:59:59Z", "2026-12-31", "2027-01-13"],
    ["2026-12-31T15:00:00Z", "2027-01-01", "2027-01-14"],
    ["2026-10-05T23:59:59Z", "2026-10-06", "2026-10-19"],
    ["2026-10-06T00:00:00Z", "2026-10-06", "2026-10-19"],
    ["2028-02-28T23:00:00-08:00", "2028-02-29", "2028-03-13"],
    ["2026-03-08T01:30:00-05:00", "2026-03-08", "2026-03-21"],
  ])("defaults to 14 Seoul calendar dates at %s", (instant, start, last) => {
    expect(defaultSearchDates(new Date(instant))).toEqual({ start, last });
    expect((Date.parse(exclusiveSearchEnd(last)) - Date.parse(start)) / 86_400_000).toBe(14);
  });
});

describe("closure policy contract", () => {
  it("preserves automatic OR conditions and converts Seoul deadline to UTC", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const value = { ...base, useDeadline: true, deadline: "2026-10-06T18:30" };
    expect(createRoomSchema.safeParse(value).success).toBe(true);
    expect(createRoomBody(value)).toMatchObject({ expected_participants: 4, submission_deadline: "2026-10-06T09:30:00.000Z", manual_only: false });
    expect(createRoomBody({ ...value, useExpected: false })).toMatchObject({ expected_participants: null, submission_deadline: "2026-10-06T09:30:00.000Z" });
  });
  it("manual ignores retained automatic fields and sends no automatic conditions", () => {
    const value = { ...base, manualOnly: true, useDeadline: true, deadline: "invalid", expectedParticipants: "" };
    expect(createRoomSchema.safeParse(value).success).toBe(true);
    expect(createRoomBody(value)).toMatchObject({ expected_participants: null, submission_deadline: null, manual_only: true });
  });
  it("requires at least one automatic condition", () => {
    expect(createRoomSchema.safeParse({ ...base, useExpected: false }).success).toBe(false);
  });
  it.each(["", "1", "51", "2.5", "NaN"])("rejects invalid participant count %s", expectedParticipants => {
    expect(createRoomSchema.safeParse({ ...base, expectedParticipants }).success).toBe(false);
  });
  it.each(["", "invalid", "2026-10-05T09:00", "2026-10-05T08:59"])("rejects missing or expired deadline %s", deadline => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    expect(createRoomSchema.safeParse({ ...base, useDeadline: true, deadline }).success).toBe(false);
  });
});
