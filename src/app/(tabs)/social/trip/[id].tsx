import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TripPhotos } from '@/components/photos/trip-photos';
import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  ErrorText,
  formatDate,
  formatDateRange,
  Pill,
  Screen,
  SectionTitle,
} from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type SharedTrip } from '@/lib/api';
import { formatTime } from '@/lib/calendar';
import { CATEGORY_ICON, TRIP_PRIVACY, TRIP_STATUS } from '@/lib/labels';

/**
 * Someone else's trip, read-only. The server only sends what's safe to share, and this screen
 * deliberately doesn't reuse ItineraryItemRow, which shows costs, notes and booking links.
 */
export default function SharedTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { data: trip, error, refreshing, refresh } = useApi(() => api.sharedTrip(id));

  if (!trip) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const status = TRIP_STATUS[trip.status];
  const travelers = trip.members.map((m) => m.display_name || 'Traveler').join(', ');

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: trip.destination }} />

      <Card>
        <View style={styles.row}>
          <ThemedText type="heading" style={styles.title}>
            {trip.title}
          </ThemedText>
          <Pill label={status.label} color={theme[status.tone]} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.members_count > 1 ? `Travelers: ${travelers}` : `By ${trip.owner.display_name || 'Traveler'}`}
        </ThemedText>
        <View style={styles.row}>
          <Pill label={TRIP_PRIVACY[trip.privacy].label} />
          {trip.rating !== null && (
            <ThemedText type="small" style={{ color: theme.warning }} accessibilityLabel={`Rated ${trip.rating} of 5`}>
              {'★'.repeat(trip.rating)}
            </ThemedText>
          )}
        </View>
        {!!trip.summary && <ThemedText type="small">{trip.summary}</ThemedText>}
        {trip.viewer_is_member && (
          <Button title="Open full trip" onPress={() => router.navigate(`/trips/${trip.id}`, { withAnchor: true })} />
        )}
      </Card>

      <SectionTitle>Itinerary</SectionTitle>
      {trip.days.map((day) => (
        <Card key={day.date}>
          <ThemedText type="smallBold">
            {formatDate(day.date)}
            {day.theme ? ` · ${day.theme}` : ''}
          </ThemedText>
          {day.items.length === 0 && (
            <ThemedText type="accent" themeColor="textSecondary">
              Free day
            </ThemedText>
          )}
          {day.items.map((item) => (
            <SharedItemRow key={item.id} item={item} />
          ))}
        </Card>
      ))}

      <SectionTitle>Photos</SectionTitle>
      <TripPhotos tripId={trip.id} days={trip.days} photos={trip.photos} canUpload={false} />
    </Screen>
  );
}

function SharedItemRow({ item }: { item: SharedTrip['days'][number]['items'][number] }) {
  return (
    <View style={styles.item}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
        {formatTime(item.time)}
      </ThemedText>
      <View style={styles.itemText}>
        <ThemedText type="small">
          {CATEGORY_ICON[item.category]} {item.title}
        </ThemedText>
        {!!item.place_name && item.place_name !== item.title && (
          <ThemedText type="small" themeColor="textSecondary">
            {item.place_name}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  title: { flex: 1, fontSize: 28, lineHeight: 34 },
  item: { flexDirection: 'row', gap: Spacing.three },
  time: { width: 68, fontVariant: ['tabular-nums'] },
  itemText: { flex: 1, gap: Spacing.half },
});
