import { useState } from 'react';

import { DayView } from '@/components/calendar/day-view';
import { MonthView } from '@/components/calendar/month-view';
import { WeekView } from '@/components/calendar/week-view';
import { EmptyState, ErrorText, Screen, Segmented } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { indexTrips } from '@/lib/calendar';
import { isoDate } from '@/lib/dates';

type View = 'month' | 'week' | 'day';

export default function CalendarScreen() {
  const { data: trips, error, refreshing, refresh } = useApi(api.trips);
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = indexTrips(trips ?? []);
  const today = isoDate(new Date());
  const onTripToday = byDate.has(today);
  // Until the user picks a day, focus today while traveling, otherwise the next upcoming trip day.
  const upcoming = [...byDate.keys()].sort().find((d) => d >= today);
  const selectedKey = selected ?? (onTripToday ? today : (upcoming ?? today));
  // While on a trip, open straight to today's schedule.
  const currentView = view ?? (onTripToday ? 'day' : 'month');

  const openDay = (key: string) => {
    setSelected(key);
    setView('day');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ErrorText message={error} />
      <Segmented
        options={['month', 'week', 'day'] as const}
        labels={{ month: 'Month', week: 'Week', day: 'Day' }}
        value={currentView}
        onChange={setView}
      />

      {trips?.length === 0 && (
        <EmptyState title="No trips yet" body="Plan a trip and its itinerary shows up here day by day." />
      )}

      {currentView === 'month' && (
        <MonthView byDate={byDate} selected={selectedKey} today={today} onSelect={setSelected} />
      )}
      {currentView === 'week' && (
        <WeekView byDate={byDate} selected={selectedKey} today={today} onSelect={setSelected} onOpenDay={openDay} />
      )}
      {currentView === 'day' && (
        <DayView byDate={byDate} selected={selectedKey} today={today} onSelect={setSelected} />
      )}
    </Screen>
  );
}
