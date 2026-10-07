import type { TripStatus } from '@/lib/api';

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: 'tint' | 'success' | 'warning' | 'textSecondary' }> = {
  planned: { label: 'Planned', tone: 'tint' },
  booked: { label: 'Booked', tone: 'success' },
  in_progress: { label: 'On the trip', tone: 'success' },
  awaiting_feedback: { label: 'How was it?', tone: 'warning' },
  completed: { label: 'Completed', tone: 'textSecondary' },
};

export const CATEGORY_ICON = {
  activity: '🎟️',
  meal: '🍽️',
  transport: '🚕',
  lodging: '🏨',
  flight: '✈️',
  free_time: '🌴',
} as const;
