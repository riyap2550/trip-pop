import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Button, Card, Chip, ErrorText, formatDate, Input, Screen, Segmented } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { api, type ItemCategory, type ItemFields, type ItineraryItem } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';
import { CATEGORY_ICON } from '@/lib/labels';

type Draft = {
  category: ItemCategory;
  title: string;
  time: string;
  place: string;
  cost: string;
  notes: string;
  indoor: boolean;
};

const NEW_ITEM: Draft = { category: 'activity', title: '', time: '12:00', place: '', cost: '', notes: '', indoor: false };

// Kinds a traveler can add. Flights and hotels come from the planner, priced from live quotes.
const ADDABLE: { id: ItemCategory; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'meal', label: 'Meal' },
  { id: 'transport', label: 'Transport' },
  { id: 'free_time', label: 'Free time' },
];

const toDraft = (i: ItineraryItem): Draft => ({
  category: i.category,
  title: i.title,
  time: i.time,
  place: i.place_name ?? '',
  cost: i.est_cost_usd ? String(i.est_cost_usd) : '',
  notes: i.notes ?? '',
  indoor: i.indoor,
});

export default function EditItemScreen() {
  const { id, date, item: itemId } = useLocalSearchParams<{ id: string; date: string; item?: string }>();
  const { data: trip, error } = useApi(() => api.trip(id));
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = trip?.days.find((d) => d.date === date)?.items.find((i) => i.id === itemId);
  if (!trip || (itemId && !original)) {
    return (
      <Screen>
        <ErrorText message={error ?? (trip ? 'That item is no longer in the itinerary.' : null)} />
      </Screen>
    );
  }

  const adding = !itemId;
  const draft = edits ?? (original ? toDraft(original) : NEW_ITEM);
  const set = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch });
  const pricedSeparately = draft.category === 'flight' || draft.category === 'lodging';
  const showIndoor = ['activity', 'meal', 'free_time'].includes(draft.category);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await action();
      emitDataChanged();
      router.back();
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  };

  const save = () => {
    const fields: ItemFields = {
      time: draft.time,
      title: draft.title,
      place_name: draft.place,
      notes: draft.notes,
      indoor: draft.indoor,
      ...(!pricedSeparately && { est_cost_usd: Number(draft.cost.replace(/[^0-9.]/g, '')) || 0 }),
    };
    run(() => (adding ? api.addItem(trip.id, date, { ...fields, category: draft.category }) : api.updateItem(trip.id, date, itemId, fields)));
  };

  const remove = () =>
    Alert.alert('Remove this from your itinerary?', draft.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => api.deleteItem(trip.id, date, itemId!)) },
    ]);

  return (
    <Screen>
      <ThemedText type="accent" themeColor="textSecondary">
        {formatDate(date)}
        {adding ? ' · New item' : ''}
      </ThemedText>

      {adding && (
        <Card>
          <ThemedText type="heading">What is it?</ThemedText>
          <View style={styles.chips}>
            {ADDABLE.map((c) => (
              <Chip
                key={c.id}
                label={`${CATEGORY_ICON[c.id]} ${c.label}`}
                selected={draft.category === c.id}
                onPress={() => set({ category: c.id })}
              />
            ))}
          </View>
        </Card>
      )}

      <Card>
        <ThemedText type="heading">Details</ThemedText>
        <Label>Title</Label>
        <Input value={draft.title} onChangeText={(title) => set({ title })} placeholder="What's the plan?" editable={!saving} />
        <Label>Time</Label>
        <TimeField value={draft.time} onChange={(time) => set({ time })} />
        {!pricedSeparately && draft.category !== 'transport' && (
          <>
            <Label>Place</Label>
            <Input
              value={draft.place}
              onChangeText={(place) => set({ place })}
              placeholder="Venue or restaurant (optional)"
              editable={!saving}
            />
          </>
        )}
        {pricedSeparately ? (
          <ThemedText type="small" themeColor="textSecondary">
            {draft.category === 'flight' ? 'Flights' : 'Hotels'} are priced from live quotes, so there&apos;s no cost to
            edit here.
          </ThemedText>
        ) : (
          <>
            <Label>Cost for everyone, in USD</Label>
            <Input
              value={draft.cost}
              onChangeText={(cost) => set({ cost })}
              placeholder="Optional"
              keyboardType="decimal-pad"
              editable={!saving}
            />
          </>
        )}
        <Label>Notes</Label>
        <Input
          value={draft.notes}
          onChangeText={(notes) => set({ notes })}
          placeholder="Notes (optional)"
          multiline
          editable={!saving}
        />
        {showIndoor && (
          <Segmented
            options={['indoor', 'outdoor'] as const}
            value={draft.indoor ? 'indoor' : 'outdoor'}
            onChange={(v) => set({ indoor: v === 'indoor' })}
          />
        )}
      </Card>

      <Button title={adding ? 'Add to itinerary' : 'Save'} onPress={save} disabled={!draft.title.trim()} loading={saving} />
      {!adding && <Button title="Remove from itinerary" variant="danger" onPress={remove} disabled={saving} />}
      <ErrorText message={saveError} />
    </Screen>
  );
}

function Label({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: -Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
