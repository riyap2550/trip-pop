import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ItineraryItemRow } from '@/components/itinerary-item';
import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, formatDate } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromKey, type TripIndex } from '@/lib/calendar';
import { isoDate } from '@/lib/dates';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Month = { year: number; month: number }; // month is 0-11

/** Weeks of the month as rows of day numbers, padded with nulls. Weeks start on Sunday. */
function monthGrid({ year, month }: Month) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function MonthView({
  byDate,
  selected,
  today,
  onSelect,
}: {
  byDate: TripIndex;
  selected: string;
  today: string;
  onSelect: (key: string) => void;
}) {
  const theme = useTheme();
  // Follows the selected day until the user pages to another month. (Trips load after first render,
  // which moves the selected day, so this can't be fixed at mount.)
  const [pagedMonth, setPagedMonth] = useState<Month | null>(null);
  const selectedDate = fromKey(selected);
  const month = pagedMonth ?? { year: selectedDate.getFullYear(), month: selectedDate.getMonth() };
  const entries = byDate.get(selected) ?? [];

  const changeMonth = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setPagedMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <Card>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => changeMonth(-1)} hitSlop={12} accessibilityLabel="Previous month">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} tintColor={theme.accent} size={20} />
          </Pressable>
          <ThemedText type="heading">{monthLabel}</ThemedText>
          <Pressable onPress={() => changeMonth(1)} hitSlop={12} accessibilityLabel="Next month">
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={theme.accent} size={20} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {WEEKDAYS.map((d, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>
              {d}
            </ThemedText>
          ))}
        </View>

        {monthGrid(month).map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((day, i) => {
              if (day === null) return <View key={i} style={styles.cell} />;
              const key = isoDate(new Date(month.year, month.month, day));
              const hasPlans = byDate.has(key);
              const isSelected = key === selected;
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  onPress={() => onSelect(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${formatDate(key)}${hasPlans ? ', trip day' : ''}`}>
                  <View
                    style={[
                      styles.dayCircle,
                      hasPlans && { backgroundColor: theme.backgroundSelected },
                      key === today && { borderWidth: 1.5, borderColor: theme.accent },
                      isSelected && { backgroundColor: theme.tint },
                    ]}>
                    <ThemedText
                      type={hasPlans ? 'smallBold' : 'small'}
                      style={{ color: isSelected ? theme.tintText : hasPlans ? theme.tint : theme.text }}>
                      {day}
                    </ThemedText>
                  </View>
                  <View
                    style={[styles.dot, { backgroundColor: hasPlans && !isSelected ? theme.accent : 'transparent' }]}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      <ThemedText type="smallBold">{formatDate(selected)}</ThemedText>

      {entries.length === 0 && <EmptyState title="Nothing planned" body="Tap a highlighted day to see its plans." />}

      {entries.map(({ trip, day, dayNumber }) => (
        <Card key={trip.id}>
          <Link href={`/trips/${trip.id}`} asChild>
            <Pressable style={styles.tripLink}>
              <View style={{ flex: 1 }}>
                <ThemedText type="heading">{trip.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Day {dayNumber} of {trip.days.length}
                  {day.theme ? ` · ${day.theme}` : ''}
                </ThemedText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                tintColor={theme.textSecondary}
                size={14}
              />
            </Pressable>
          </Link>
          {day.items.map((item) => (
            <ItineraryItemRow key={item.id} item={item} />
          ))}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.one,
  },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  tripLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
