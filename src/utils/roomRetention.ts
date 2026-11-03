const RETENTION_MS = 30 * 86_400_000;
const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
function calendarDay(time: number) {
  const parts = kstDate.formatToParts(time);
  const value = (kind: string) => Number(parts.find(part => part.type === kind)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}
/** Uses server-owned dates only; KST calendar D-day is distinct from the inclusive expiry instant. */
export function roomRetentionLabel(createdAt: string, expiresAt: string, now = Date.now()): string | null {
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!timestamp.test(createdAt) || !timestamp.test(expiresAt)) return null;
  const created = Date.parse(createdAt), expires = Date.parse(expiresAt);
  if (![created, expires, now].every(Number.isFinite) || expires - created !== RETENTION_MS) return null;
  if (now > expires) return "자동 정리 예정";
  return `자동 정리까지 D-${Math.max(0, calendarDay(expires) - calendarDay(now))}`;
}
