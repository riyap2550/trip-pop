import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isoDate, nightsBetween, type DateRange } from '@/lib/dates';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_NIGHTS = 30;

/**
 * Month grid for picking a trip's dates: tap the first day, then the last. Tapping again
 * after a full range (or before the start) begins a new range.
 */
export function DateRangeCalendar({
  value,
  onChange,
  disabled,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const today = new Date();
  const tomorrow = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const initial = value.start ? new Date(`${value.start}T12:00:00`) : today;
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear() + 1, today.getMonth(), 1);
  const canGoBack = month > firstMonth;
  const canGoForward = month < lastMonth;

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(month.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  while (cells.length % 7) cells.push(null);

  const pick = (day: string) => {
    const { start, end } = value;
    if (!start || end || day <= start) {
      onChange({ start: day, end: null });
    } else if (nightsBetween(start, day) > MAX_NIGHTS) {
      onChange({ start: day, end: null });
    } else {
      onChange({ start, end: day });
    }
  };

  const shiftMonth = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <View style={{ gap: Spacing.two, opacity: disabled ? 0.45 : 1 }}>
      <View style={styles.header}>
        <NavButton direction="left" accessibilityLabel="Previous month" enabled={canGoBack} onPress={() => shiftMonth(-1)} />
        <ThemedText type="heading">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </ThemedText>
        <NavButton direction="right" accessibilityLabel="Next month" enabled={canGoForward} onPress={() => shiftMonth(1)} />
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>
            {d}
          </ThemedText>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const past = day < tomorrow;
            const isEdge = day === value.start || day === value.end;
            const inRange = !!value.start && !!value.end && day > value.start && day < value.end;
            return (
              <Pressable
                key={day}
                disabled={past || disabled}
                onPress={() => pick(day)}
                accessibilityRole="button"
                accessibilityLabel={new Date(`${day}T12:00:00`).toDateString()}
                accessibilityState={{ selected: isEdge || inRange, disabled: past }}
                style={[
                  styles.cell,
                  inRange && { backgroundColor: theme.backgroundSelected },
                  isEdge && { backgroundColor: theme.tint, borderRadius: 999 },
                ]}>
                <ThemedText
                  type="small"
                  style={{
                    color: isEdge ? theme.tintText : past ? theme.textSecondary : theme.text,
                    opacity: past ? 0.4 : 1,
                  }}>
                  {Number(day.slice(8))}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavButton({
  direction,
  accessibilityLabel,
  enabled,
  onPress,
}: {
  direction: 'left' | 'right';
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.nav, { opacity: !enabled ? 0.25 : pressed ? 0.6 : 1 }]}>
      <SymbolView
        name={{ ios: `chevron.${direction}`, android: `chevron_${direction}` }}
        tintColor={theme.accent}
        size={20}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { padding: Spacing.two },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
});
