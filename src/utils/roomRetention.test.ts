import { describe, expect, it } from "vitest";
import { roomRetentionLabel } from "./roomRetention";
const created = "2026-11-03T00:00:00Z", expires = "2026-12-03T00:00:00Z";
describe("server-owned retention dates, KST D-day", () => {
  it("changes at KST midnight rather than UTC midnight", () => {
    expect(roomRetentionLabel(created, expires, Date.parse("2026-12-02T14:59:59Z"))).toBe("자동 정리까지 D-1");
    expect(roomRetentionLabel(created, expires, Date.parse("2026-12-02T15:00:00Z"))).toBe("자동 정리까지 D-0");
  });
  it("includes the exact expiry instant but never claims cleanup already completed", () => {
    expect(roomRetentionLabel(created, expires, Date.parse(expires))).toBe("자동 정리까지 D-0");
    expect(roomRetentionLabel(created, expires, Date.parse(expires) + 1)).toBe("자동 정리 예정");
  });
  it("accepts equivalent timezone offsets", () => {
    expect(roomRetentionLabel("2026-11-03T09:00:00+09:00", "2026-12-03T09:00:00+09:00", Date.parse("2026-12-01T18:00:00-06:00"))).toBe("자동 정리까지 D-1");
  });
  it.each([["", expires], [created, ""], ["invalid", expires], [created, "2026-12-04T00:00:00Z"], ["2026-11-03T00:00:00", expires]])("does not invent a date from missing/invalid/old retention fields", (a,b) => {
    expect(roomRetentionLabel(a,b)).toBeNull();
  });
});
