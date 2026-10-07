import type { Trip } from '@/lib/api';
import { isoDate } from '@/lib/dates';

export type DayEntry = { trip: Trip; day: Trip['days'][number]; dayNumber: number };
export type TripIndex = Map<string, DayEntry[]>;

/** Index every itinerary day by date (YYYY-MM-DD) so views can look them up. */
export function indexTrips(trips: Trip[]): TripIndex {
  const byDate: TripIndex = new Map();
  for (const trip of trips) {
    trip.days.forEach((day, i) => {
      byDate.set(day.date, [...(byDate.get(day.date) ?? []), { trip, day, dayNumber: i + 1 }]);
    });
  }
  return byDate;
}

export const fromKey = (key: string) => new Date(`${key}T12:00:00`);

export function addDays(key: string, n: number) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** The Sunday-to-Saturday week containing `key`. */
export function weekOf(key: string) {
  const start = addDays(key, -fromKey(key).getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "14:30" → "2:30 PM". Itinerary times are local 24-hour HH:MM. */
export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** Current local time as HH:MM, comparable with itinerary item times. */
export function nowHHMM(now: Date) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
