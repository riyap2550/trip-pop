import { Link, router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  formatDateRange,
  money,
  Pill,
  screenContentStyle,
} from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type Trip } from '@/lib/api';
import { isDayTrip, isoDate } from '@/lib/dates';
import { TRIP_STATUS } from '@/lib/labels';

/** A trip is past once it has ended, even if the background watcher hasn't updated its status yet. */
function isPast(trip: Trip, today: string) {
  return trip.status === 'awaiting_feedback' || trip.status === 'completed' || trip.end_date < today;
}

/** How far (px) the fade from upcoming to past colors runs, centered where the divider meets the screen's middle. */
const FADE_DISTANCE = 160;

export default function TripsScreen() {
  const theme = useTheme();
  const { data: trips, error, refreshing, refresh } = useApi(api.trips);

  // The background shifts to the "past" color as the Past trips divider scrolls up past the middle of the screen.
  const scrollY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const dividerY = useSharedValue(-1); // -1 until the divider is laid out
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const hasPast = !!trips?.some((t) => isPast(t, isoDate(new Date())));
  const backgroundStyle = useAnimatedStyle(() => {
    const progress =
      !hasPast || dividerY.value < 0
        ? 0
        : interpolate(
            scrollY.value + viewportHeight.value / 2,
            [dividerY.value - FADE_DISTANCE / 2, dividerY.value + FADE_DISTANCE / 2],
            [0, 1],
            Extrapolation.CLAMP,
          );
    return { backgroundColor: interpolateColor(progress, [0, 1], [theme.background, theme.backgroundPast]) };
  });

  const today = isoDate(new Date());
  const upcoming = (trips ?? [])
    .filter((t) => !isPast(t, today))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = (trips ?? [])
    .filter((t) => isPast(t, today))
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  return (
    <Animated.ScrollView
      style={backgroundStyle}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={(e) => {
        viewportHeight.value = e.nativeEvent.layout.height;
      }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={screenContentStyle}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <ErrorText message={error} />
      {trips?.length === 0 && (
        <EmptyState title="No trips yet" body="Head to Plan and describe the trip you want." />
      )}

      {!!trips?.length && (
        <>
          <ThemedText type="heading" style={styles.sectionTitle}>
            Upcoming trips
          </ThemedText>
          {upcoming.length ? (
            upcoming.map((trip) => <TripCard key={trip.id} trip={trip} />)
          ) : (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                Nothing on the horizon yet. Where would you like to go next?
              </ThemedText>
              <Button title="Plan a trip" onPress={() => router.navigate('/')} />
            </Card>
          )}
        </>
      )}

      {past.length > 0 && (
        <>
          <View
            style={styles.divider}
            onLayout={(e) => {
              dividerY.value = e.nativeEvent.layout.y;
            }}>
            <View style={[styles.rule, { backgroundColor: theme.tint }]} />
            <ThemedText type="subtitle" style={styles.dividerTitle}>
              Past trips
            </ThemedText>
            {/* Full text color: secondary gray is too faint on the seafoam background. */}
            <ThemedText type="accent">
              Memories from the road
            </ThemedText>
          </View>
          {past.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </>
      )}
    </Animated.ScrollView>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const theme = useTheme();
  const status = TRIP_STATUS[trip.status];
  return (
    <Link href={`/trips/${trip.id}`} asChild>
      <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
        <Card>
          <View style={styles.row}>
            <ThemedText type="heading" style={{ flex: 1 }}>
              {trip.title}
            </ThemedText>
            <Pill label={status.label} color={theme[status.tone]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
            {isDayTrip(trip) ? ' · Day trip' : ''}
          </ThemedText>
          <ThemedText type="small">
            {money(trip.costs.total)} of {money(trip.budget_usd)} budget
          </ThemedText>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { marginTop: Spacing.two, marginBottom: -Spacing.one },
  divider: { alignItems: 'center', gap: Spacing.one, marginTop: Spacing.six, marginBottom: Spacing.two },
  rule: { width: 64, height: 2, borderRadius: 1, marginBottom: Spacing.three },
  dividerTitle: { fontSize: 32, lineHeight: 38 },
});
