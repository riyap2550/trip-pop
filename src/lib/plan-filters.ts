import { nightsBetween, type DateRange } from '@/lib/dates';

export type BudgetBasis = 'person' | 'total';
export type DateMode = 'flexible' | 'exact';

export const BUDGETS = [
  { id: 'under_1k', label: 'Under $1k', min: null, max: 1000 },
  { id: '1k_2k', label: '$1k–2k', min: 1000, max: 2000 },
  { id: '2k_3500', label: '$2k–3.5k', min: 2000, max: 3500 },
  { id: '3500_5k', label: '$3.5k–5k', min: 3500, max: 5000 },
  { id: '5k_plus', label: '$5k+', min: 5000, max: null },
  { id: 'custom', label: 'Custom', min: null, max: null },
] as const;
export type BudgetId = (typeof BUDGETS)[number]['id'];

export const TRIP_TYPES = [
  { label: "Girls' trip", travelers: null },
  { label: "Guys' trip", travelers: null },
  { label: 'Couples getaway', travelers: 2 },
  { label: 'Honeymoon', travelers: 2 },
  { label: 'Family', travelers: null },
  { label: 'Friends', travelers: null },
  { label: 'Solo', travelers: 1 },
  { label: 'Bachelorette', travelers: null },
  { label: 'Bachelor party', travelers: null },
  { label: 'Birthday', travelers: null },
] as const;

export const VIBES = [
  { emoji: '🏖️', label: 'Beach' },
  { emoji: '🍽️', label: 'Food & drink' },
  { emoji: '🪩', label: 'Nightlife' },
  { emoji: '🧘', label: 'Relax & spa' },
  { emoji: '🥾', label: 'Adventure' },
  { emoji: '🌲', label: 'Nature' },
  { emoji: '🏛️', label: 'Culture & history' },
  { emoji: '🏙️', label: 'City break' },
  { emoji: '🛍️', label: 'Shopping' },
  { emoji: '✨', label: 'Luxury' },
  { emoji: '💸', label: 'Budget-friendly' },
  { emoji: '📸', label: 'Instagrammable' },
] as const;

export const DURATIONS = [
  { id: 'day', label: 'Day trip', phrase: 'a day trip: out and back the same day, no overnight stay' },
  { id: 'weekend', label: 'Weekend', phrase: 'a 2–3 day weekend' },
  { id: '4_5', label: '4–5 days', phrase: '4–5 days' },
  { id: 'week', label: '1 week', phrase: 'about a week' },
  { id: '10', label: '10 days', phrase: 'about 10 days' },
  { id: '2_weeks', label: '2 weeks', phrase: 'about 2 weeks' },
] as const;
export type DurationId = (typeof DURATIONS)[number]['id'];

export type PlanFilters = {
  destination: string;
  budget: BudgetId | null;
  customBudget: string;
  budgetBasis: BudgetBasis;
  travelers: number;
  tripType: string | null;
  vibes: string[];
  dateMode: DateMode;
  range: DateRange;
  month: string | null; // YYYY-MM
  duration: DurationId | null;
  notes: string;
};

export const EMPTY_FILTERS: PlanFilters = {
  destination: '',
  budget: null,
  customBudget: '',
  budgetBasis: 'person',
  travelers: 1,
  tripType: null,
  vibes: [],
  dateMode: 'flexible',
  range: { start: null, end: null },
  month: null,
  duration: null,
  notes: '',
};

/**
 * The next 12 months as chips: "Oct", "Nov", …, "Jan '27" once the year rolls over.
 * Skips the current month when less than about a week and a half of it is left.
 */
export function upcomingMonths(from = new Date()) {
  const daysLeft = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate() - from.getDate();
  const offset = daysLeft < 10 ? 1 : 0;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + offset + i, 1);
    const short = d.toLocaleDateString('en-US', { month: 'short' });
    return {
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.getFullYear() === from.getFullYear() ? short : `${short} '${String(d.getFullYear()).slice(2)}`,
      long: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  });
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function budgetRange(f: PlanFilters): { min: number | null; max: number | null } | null {
  if (!f.budget) return null;
  if (f.budget === 'custom') {
    const amount = Number(f.customBudget.replace(/[^0-9.]/g, ''));
    return amount > 0 ? { min: null, max: amount } : null;
  }
  const { min, max } = BUDGETS.find((b) => b.id === f.budget)!;
  return { min, max };
}

function describeBudget(f: PlanFilters): string | null {
  const range = budgetRange(f);
  if (!range) return null;
  const { min, max } = range;
  const phrase = (scale: number) =>
    min && max
      ? `${usd(min * scale)}–${usd(max * scale)}`
      : max
        ? `${f.budget === 'custom' ? 'up to' : 'under'} ${usd(max * scale)}`
        : `${usd(min! * scale)} or more`;
  const group = f.travelers === 2 ? 'both travelers' : `all ${f.travelers} travelers`;
  const splurge = !max ? ' Comfort matters more than saving.' : '';
  if (f.travelers === 1) return `${phrase(1)} total.${splurge}`;
  if (f.budgetBasis === 'total') return `${phrase(1)} total for ${group}.${splurge}`;
  return `${phrase(1)} per person, so ${phrase(f.travelers)} total for ${group}.${splurge}`;
}

function describeDates(f: PlanFilters, months = upcomingMonths()): string | null {
  if (f.dateMode === 'exact') {
    if (!f.range.start || !f.range.end) return null;
    const nights = nightsBetween(f.range.start, f.range.end);
    if (nights === 0) return `exactly ${f.range.start}, as a day trip: out and back the same day, no overnight stay. Use this date.`;
    return `exactly ${f.range.start} to ${f.range.end} (${nights} night${nights === 1 ? '' : 's'}). Use these dates.`;
  }
  const duration = DURATIONS.find((d) => d.id === f.duration)?.phrase;
  const month = months.find((m) => m.id === f.month)?.long;
  if (!month && !duration) return null;
  return `flexible${month ? `, sometime in ${month}` : ''}${duration ? `, for ${duration}` : ''}. Pick the cheapest good ${f.duration === 'day' ? 'date' : 'dates'}.`;
}

/** Why the current selections can't be planned yet, or null when they can. */
export function filtersProblem(f: PlanFilters): string | null {
  if (f.dateMode === 'exact' && f.range.start && !f.range.end) return 'Tap an end date to finish picking your dates.';
  if (f.budget === 'custom' && !budgetRange(f)) return 'Enter a budget amount.';
  return null;
}

export function hasAnyFilter(f: PlanFilters) {
  return !!(
    f.destination.trim() ||
    f.budget ||
    f.tripType ||
    f.vibes.length ||
    describeDates(f) ||
    (f.dateMode === 'exact' && f.range.start) ||
    f.notes.trim() ||
    f.travelers > 1
  );
}

/** Turn the selections into the plain-language goal the planning agent reads (and the trip keeps). */
export function buildGoal(f: PlanFilters): string {
  const where = f.destination.trim();
  const lines = [
    f.tripType && `Trip type: ${f.tripType}.`,
    where ? `Destination: ${where}.` : 'Destination: open. Suggest the best fit.',
    `Travelers: ${f.travelers}.`,
    describeBudget(f) && `Budget: ${describeBudget(f)}`,
    describeDates(f) && `Dates: ${describeDates(f)}`,
    f.vibes.length > 0 && `Vibe: ${f.vibes.join(', ').toLowerCase()}.`,
    f.notes.trim() && `Also: ${f.notes.trim()}`,
  ];
  return lines.filter(Boolean).join('\n');
}
