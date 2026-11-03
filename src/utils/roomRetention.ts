const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
function calendarDay(time: number) {
  const parts = kstDate.formatToParts(time);
  const value = (kind: string) => Number(parts.find(part => part.type === kind)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}
/** Server retention expiry is not a guaranteed physical deletion appointment. */
export function roomRetentionLabel(expiresAt: unknown, now = Date.now()): string | null {
  if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt)) return null;
  const expires = Date.parse(expiresAt);
  // Date.parse normalizes invalid calendar dates such as February 30 and 24:00.
  const wallTime = Date.parse(`${expiresAt.slice(0, 19)}Z`);
  if (![expires, wallTime, now].every(Number.isFinite) || new Date(wallTime).toISOString().slice(0, 19) !== expiresAt.slice(0, 19)) return null;
  if (now >= expires) return "자동 정리 예정";
  return `자동 정리 D-${Math.max(0, calendarDay(expires) - calendarDay(now))}`;
}
