import type { RecommendationVariantView } from "../components/recommendationView";

export function localDateTimeInstants(value: string, timeZone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return [];
  const normalized = value.length === 16 ? `${value}:00` : value;
  const wall = new Date(`${normalized}Z`).getTime();
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19) !== normalized) return [];
  try {
    // Discover real offsets around this date, including half-hour DST changes.
    // Round trips reject gaps and retain both instants during an overlap.
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = wall + hours * 3_600_000;
      offsets.add(new Date(`${wallTime(sample, timeZone)}Z`).getTime() - sample);
    }
    return [...offsets].map(offset => wall - offset)
      .filter(instant => wallTime(instant, timeZone) === normalized)
      .sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
  } catch { return []; }
}

export function validateSelection(startAt: string, endAt: string, variant: RecommendationVariantView): boolean {
  const [start, end, availableStart, availableEnd] = [startAt, endAt, variant.startAt, variant.endAt].map(value => new Date(value).getTime());
  return start !== undefined && end !== undefined && availableStart !== undefined && availableEnd !== undefined
    && [start, end, availableStart, availableEnd].every(Number.isFinite)
    && availableStart <= start && start < end && end <= availableEnd;
}

export function formatRecommendationRange(startAt: string, endAt: string, timeZone: string): string {
  return `${formatRecommendationInstant(startAt, timeZone)} – ${formatRecommendationInstant(endAt, timeZone)}`;
}

function wallTime(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatRecommendationInstant(value: string, timeZone: string): string {
  const instant = new Date(value).getTime();
  const wall = wallTime(instant, timeZone);
  const minutes = Math.round((new Date(`${wall}Z`).getTime() - instant) / 60_000);
  const offset = `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
  const seconds = wall.endsWith(":00") ? "" : wall.slice(16);
  return `${wall.slice(0, 10)} ${wall.slice(11, 16)}${seconds} (UTC${offset})`;
}
