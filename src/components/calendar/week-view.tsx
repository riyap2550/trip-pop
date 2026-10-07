import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatTime, fromKey, weekOf, type TripIndex } from '@/lib/calendar';
import { CATEGORY_ICON } from '@/lib/labels';

const PREVIEW_ITEMS = 3;

const shortDate = (key: string) => fromKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Seven days at a glance, one row per day. Tapping a day opens its schedule. */
export function WeekView({
  byDate,
  selected,
  today,
  onSelect,
  onOpenDay,
}: {
  byDate: TripIndex;
  selected: string;
  today: string;
  onSelect: (key: string) => void;
  onOpenDay: (key: string) => void;
}) {
  const theme = useTheme();
  const days = weekOf(selected);

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Pressable onPress={() => onSelect(addDays(selected, -7))} hitSlop={12} accessibilityLabel="Previous week">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} tintColor={theme.accent} size={20} />
          </Pressable>
          <ThemedText type="heading">
            {shortDate(days[0])} – {shortDate(days[6])}
          </ThemedText>
          <Pressable onPress={() => onSelect(addDays(selected, 7))} hitSlop={12} accessibilityLabel="Next week">
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={theme.accent} size={20} />
          </Pressable>
        </View>
      </Card>

      {days.map((key) => {
        const entries = byDate.get(key) ?? [];
        const items = entries.flatMap((e) => e.day.items).sort((a, b) => a.time.localeCompare(b.time));
        const date = fromKey(key);
        const isToday = key === today;
        return (
          <Pressable
            key={key}
            onPress={() => onOpenDay(key)}
            accessibilityRole="button"
            accessibilityLabel={`${date.toDateString()}, ${items.length ? `${items.length} plans` : 'nothing planned'}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <Card style={entries.length ? styles.dayCard : { ...styles.dayCard, ...styles.emptyDay }}>
              <View style={[styles.dateColumn, isToday && { borderColor: theme.accent, borderWidth: 1.5 }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </ThemedText>
                <ThemedText type="heading" style={styles.dateNumber}>
                  {date.getDate()}
                </ThemedText>
              </View>

              <View style={styles.dayBody}>
                {entries.length === 0 ? (
                  <ThemedText type="accent" themeColor="textSecondary">
                    Nothing planned
                  </ThemedText>
                ) : (
                  <>
                    {entries.map(({ trip, dayNumber }) => (
                      <ThemedText key={trip.id} type="smallBold" numberOfLines={1}>
                        {trip.destination} · Day {dayNumber}
                      </ThemedText>
                    ))}
                    {items.slice(0, PREVIEW_ITEMS).map((item) => (
                      <View key={item.id} style={styles.previewRow}>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.previewTime}>
                          {formatTime(item.time)}
                        </ThemedText>
                        <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                          {CATEGORY_ICON[item.category]} {item.title}
                        </ThemedText>
                      </View>
                    ))}
                    {items.length > PREVIEW_ITEMS && (
                      <ThemedText type="small" themeColor="textSecondary">
                        +{items.length - PREVIEW_ITEMS} more
                      </ThemedText>
                    )}
                  </>
                )}
              </View>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.one },
  dayCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  emptyDay: { backgroundColor: 'transparent', boxShadow: [] },
  dateColumn: { width: 52, alignItems: 'center', borderRadius: 14, paddingVertical: Spacing.one },
  dateNumber: { fontSize: 26, lineHeight: 30 },
  dayBody: { flex: 1, gap: 2, paddingTop: Spacing.one },
  previewRow: { flexDirection: 'row', gap: Spacing.two },
  previewTime: { width: 70, fontVariant: ['tabular-nums'] },
});
