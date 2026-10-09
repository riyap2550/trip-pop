import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, formatDateRange, Pill } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { photoImageSource, type TripSummary } from '@/lib/api';
import { TRIP_STATUS } from '@/lib/labels';

/** Travelers get the full trip in the Trips tab; everyone else gets the read-only shared view. */
export function openTripSummary(trip: TripSummary) {
  if (trip.viewer_is_member) router.navigate(`/trips/${trip.id}`, { withAnchor: true });
  else router.push({ pathname: '/social/trip/[id]', params: { id: trip.id } });
}

export function TripSummaryCard({ trip }: { trip: TripSummary }) {
  const theme = useTheme();
  const { accessToken } = useAuth();
  const status = TRIP_STATUS[trip.status];
  return (
    <Pressable
      onPress={() => openTripSummary(trip)}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card>
        {trip.cover_photo_id && (
          <Image
            source={photoImageSource(trip.cover_photo_id, accessToken)}
            contentFit="cover"
            transition={150}
            style={[styles.cover, { backgroundColor: theme.backgroundSelected }]}
          />
        )}
        <View style={styles.row}>
          <ThemedText type="heading" style={styles.title}>
            {trip.title}
          </ThemedText>
          <Pill label={status.label} color={theme[status.tone]} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
        </ThemedText>
        {(trip.rating !== null || trip.photos_count > 0) && (
          <ThemedText type="small" themeColor="textSecondary">
            {trip.rating !== null && <ThemedText type="small" style={{ color: theme.warning }}>{'★'.repeat(trip.rating)} </ThemedText>}
            {trip.photos_count > 0 && `${trip.photos_count} photo${trip.photos_count > 1 ? 's' : ''}`}
          </ThemedText>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
});
