import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DateRangeCalendar } from '@/components/date-range-calendar';
import { ThemedText } from '@/components/themed-text';
import { ToolCallStatus } from '@/components/tool-call-status';
import {
  Button,
  Card,
  Chip,
  ErrorText,
  formatDate,
  Input,
  Screen,
  Stepper,
} from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi, useJob } from '@/hooks/use-api';
import { api, type Trip, type TripChanges } from '@/lib/api';
import { nightsBetween, type DateRange } from '@/lib/dates';
import { emitDataChanged } from '@/lib/data-events';

type Draft = { title: string; budget: string; travelers: number; range: DateRange };

const toDraft = (t: Trip): Draft => ({
  title: t.title,
  budget: String(Math.round(t.budget_usd)),
  travelers: t.travelers,
  range: { start: t.start_date, end: t.end_date },
});

/** Only what the traveler actually changed, so untouched fields aren't re-sent or re-priced. */
function changesFrom(trip: Trip, d: Draft): TripChanges {
  const changes: TripChanges = {};
  if (d.title.trim() && d.title.trim() !== trip.title) changes.title = d.title.trim();
  const budget = Number(d.budget.replace(/[^0-9.]/g, ''));
  if (budget > 0 && Math.round(budget) !== Math.round(trip.budget_usd)) changes.budget_usd = budget;
  if (d.travelers !== trip.travelers) changes.travelers = d.travelers;
  if (d.range.start && d.range.end) {
    if (d.range.start !== trip.start_date) changes.start_date = d.range.start;
    if (d.range.end !== trip.end_date) changes.end_date = d.range.end;
  }
  return changes;
}

/** Planned items (not flights, which move to the new last day) on days a shorter trip would drop. */
function itemsLost(trip: Trip, range: DateRange) {
  if (!range.start || !range.end) return 0;
  const keep = nightsBetween(range.start, range.end) + 1;
  return [...trip.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(keep)
    .flatMap((d) => d.items)
    .filter((i) => i.category !== 'flight').length;
}

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trip, error } = useApi(() => api.trip(id));
  const [edits, setEdits] = useState<Draft | null>(null);
  const job = useJob(() => emitDataChanged());

  if (!trip) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const draft = edits ?? toDraft(trip);
  const set = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch });
  const { start, end } = draft.range;
  const changes = changesFrom(trip, draft);
  const half = !!start && !end;
  const changed = Object.keys(changes).length > 0;
  const nights = start && end ? nightsBetween(start, end) : null;

  const save = () => {
    const lost = itemsLost(trip, draft.range);
    const run = () => job.start(() => api.updateTrip(trip.id, changes));
    if (lost === 0) return run();
    Alert.alert(
      'Shorten this trip?',
      `${lost} planned item${lost > 1 ? 's' : ''} on the days that no longer fit will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Shorten', style: 'destructive', onPress: run },
      ],
    );
  };

  if (job.job?.status === 'done') {
    return (
      <Screen>
        <Card>
          <ThemedText type="heading">Trip updated</ThemedText>
          <ThemedText>{job.job.result?.summary}</ThemedText>
          <Button title="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="heading">Name</ThemedText>
        <Input value={draft.title} onChangeText={(title) => set({ title })} editable={!job.running} />
      </Card>

      <Card>
        <ThemedText type="heading">Dates</ThemedText>
        <DateRangeCalendar value={draft.range} onChange={(range) => set({ range })} disabled={job.running} />
        <ThemedText type="small" themeColor={start && end ? 'text' : 'textSecondary'}>
          {start && end
            ? nights === 0
              ? `${formatDate(start)} · Day trip`
              : `${formatDate(start)} → ${formatDate(end)} · ${nights} night${nights === 1 ? '' : 's'}`
            : start
              ? `${formatDate(start)} → tap your last day, or`
              : 'Tap your first day, then your last.'}
        </ThemedText>
        {half && (
          <View style={styles.chips}>
            <Chip label="Just this day (day trip)" onPress={() => set({ range: { start, end: start } })} />
          </View>
        )}
        {(changes.start_date || changes.end_date || changes.travelers) && (
          <ThemedText type="small" themeColor="textSecondary">
            Flights and hotel are re-priced, and your itinerary moves onto the new dates.
          </ThemedText>
        )}
      </Card>

      <Card>
        <View style={styles.row}>
          <ThemedText type="heading" style={{ flex: 1 }}>
            Travelers
          </ThemedText>
          <Stepper
            value={draft.travelers}
            min={1}
            max={12}
            label="travelers"
            onChange={(travelers) => set({ travelers })}
            disabled={job.running}
          />
        </View>
      </Card>

      <Card>
        <ThemedText type="heading">Budget</ThemedText>
        <Input
          value={draft.budget}
          onChangeText={(budget) => set({ budget })}
          keyboardType="number-pad"
          editable={!job.running}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Total in USD for flights, hotel, food, and activities.
        </ThemedText>
      </Card>

      <Button title="Save changes" onPress={save} disabled={!changed || half} loading={job.running} />
      <ErrorText message={job.error} />
      {job.job && job.running && <ToolCallStatus job={job.job} title="Updating your trip" />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
