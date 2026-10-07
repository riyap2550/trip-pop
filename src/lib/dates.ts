export type DateRange = { start: string | null; end: string | null };

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening taps don't shift a day). */
export function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A day trip starts and ends on the same date: out and back, no overnight stay. */
export const isDayTrip = (trip: { start_date: string; end_date: string }) =>
  trip.start_date.slice(0, 10) === trip.end_date.slice(0, 10);

export function nightsBetween(start: string, end: string) {
  return Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000);
}
