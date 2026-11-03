import { describe, expect, it } from "vitest";
import { roomRetentionLabel } from "./roomRetention";
const expires = "2026-12-03T00:00:00Z";
describe("room-response retention expiry, KST D-day", () => {
  it("changes at KST midnight rather than UTC midnight", () => {
    expect(roomRetentionLabel(expires, Date.parse("2026-12-02T14:59:59.999Z"))).toBe("자동 정리 D-1");
    expect(roomRetentionLabel(expires, Date.parse("2026-12-02T15:00:00Z"))).toBe("자동 정리 D-0");
    expect(roomRetentionLabel(expires, Date.parse("2026-12-02T23:59:59Z"))).toBe("자동 정리 D-0");
  });
  it("switches at the actual expiry instant without claiming deletion completed", () => {
    expect(roomRetentionLabel(expires, Date.parse(expires) - 1)).toBe("자동 정리 D-0");
    expect(roomRetentionLabel(expires, Date.parse(expires))).toBe("자동 정리 예정");
    expect(roomRetentionLabel(expires, Date.parse(expires) + 1)).toBe("자동 정리 예정");
    expect(roomRetentionLabel(expires, Date.parse("2027-01-01T00:00:00Z"))).toBe("자동 정리 예정");
  });
  it("uses the supplied deadline across month/year/leap boundaries", () => {
    expect(roomRetentionLabel(expires, Date.parse("2026-11-03T00:00:00Z"))).toBe("자동 정리 D-30");
    expect(roomRetentionLabel("2027-01-01T00:00:00Z", Date.parse("2026-12-31T14:59:59Z"))).toBe("자동 정리 D-1");
    expect(roomRetentionLabel("2028-03-01T00:00:00Z", Date.parse("2028-02-29T00:00:00Z"))).toBe("자동 정리 D-1");
    expect(roomRetentionLabel("2026-12-04T00:00:00Z", Date.parse("2026-12-02T00:00:00Z"))).toBe("자동 정리 D-2");
  });
  it("accepts equivalent timezone offsets and subsecond server precision", () => {
    expect(roomRetentionLabel("2026-12-03T09:00:00+09:00", Date.parse("2026-12-01T18:00:00-06:00"))).toBe("자동 정리 D-1");
    expect(roomRetentionLabel("2026-12-03T00:00:00.123456Z", Date.parse(expires))).toBe("자동 정리 D-0");
  });
  it.each([undefined, null, 0, {}, "", "invalid", "2026-12-03", "2026-12-03T00:00:00", "2026-02-30T00:00:00Z", "2026-12-03T24:00:00Z", "2026-13-03T00:00:00Z", "2026-12-03T00:00:00+25:00"])("does not invent a D-day for missing or invalid expiry %j", value => {
    expect(roomRetentionLabel(value)).toBeNull();
  });
  it("does not render when the clock itself is invalid", () => {
    expect(roomRetentionLabel(expires, NaN)).toBeNull();
  });
});
