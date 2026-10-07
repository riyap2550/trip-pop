import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookingLink } from '@/components/booking-link';
import { ThemedText } from '@/components/themed-text';
import { money } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItineraryItem } from '@/lib/api';
import { formatTime } from '@/lib/calendar';
import { CATEGORY_ICON } from '@/lib/labels';

/** One row of a trip day: time, what it is, cost, and a booking link. With onEdit, the row opens its editor. */
export function ItineraryItemRow({ item, onEdit }: { item: ItineraryItem; onEdit?: () => void }) {
  const theme = useTheme();
  const row = (
    <View style={styles.item}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
        {formatTime(item.time)}
      </ThemedText>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="small">
          {CATEGORY_ICON[item.category]} {item.title}
        </ThemedText>
        {!!item.notes && (
          <ThemedText type="small" themeColor="textSecondary">
            {item.notes}
          </ThemedText>
        )}
        <View style={styles.row}>
          {item.est_cost_usd > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {money(item.est_cost_usd)}
            </ThemedText>
          )}
          {item.category === 'activity' && (
            <ThemedText type="small" themeColor="textSecondary">
              {item.indoor ? 'Indoor' : 'Outdoor'}
            </ThemedText>
          )}
          <BookingLink url={item.booking_url} label={item.category === 'meal' ? 'Map' : 'Book'} />
        </View>
      </View>
      {onEdit && (
        <SymbolView name={{ ios: 'pencil', android: 'edit' }} tintColor={theme.accent} size={16} style={styles.pencil} />
      )}
    </View>
  );
  if (!onEdit) return row;
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one },
  time: { width: 68, fontVariant: ['tabular-nums'] },
  pencil: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
