import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookingLink } from '@/components/booking-link';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, EmptyState, money } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItineraryItem } from '@/lib/api';
import { addDays, formatTime, fromKey, nowHHMM, type DayEntry, type TripIndex } from '@/lib/calendar';
import { CATEGORY_ICON } from '@/lib/labels';

/** Without end times, treat the latest-started item as "now" for this long before calling it done. */
const NOW_WINDOW_MINUTES = 180;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** The current local time, refreshed every minute. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** One day's schedule as a timeline. On today's date it marks what's happening now and what's next. */
export function DayView({
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
  const now = useNow();
  const entries = byDate.get(selected) ?? [];
  const isToday = selected === today;

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Pressable onPress={() => onSelect(addDays(selected, -1))} hitSlop={12} accessibilityLabel="Previous day">
            <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} tintColor={theme.accent} size={20} />
          </Pressable>
          <View style={styles.headerText}>
            <ThemedText type="accent" themeColor="textSecondary">
              {isToday ? 'Today' : fromKey(selected).toLocaleDateString('en-US', { weekday: 'long' })}
            </ThemedText>
            <ThemedText type="heading" style={styles.headerDate}>
              {fromKey(selected).toLocaleDateString('en-US', {
                ...(isToday && { weekday: 'long' }),
                month: 'long',
                day: 'numeric',
              })}
            </ThemedText>
          </View>
          <Pressable onPress={() => onSelect(addDays(selected, 1))} hitSlop={12} accessibilityLabel="Next day">
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={theme.accent} size={20} />
          </Pressable>
        </View>
        {!isToday && (
          <View style={styles.todayRow}>
            <Chip label="Jump to today" onPress={() => onSelect(today)} />
          </View>
        )}
      </Card>

      {entries.length === 0 && (
        <EmptyState title="A free day" body="Nothing is planned for this day. Enjoy it, or plan something new." />
      )}

      {entries.map((entry) => (
        <TripDay key={entry.trip.id} entry={entry} nowTime={isToday ? nowHHMM(now) : null} />
      ))}
    </>
  );
}

function TripDay({ entry, nowTime }: { entry: DayEntry; nowTime: string | null }) {
  const theme = useTheme();
  const { trip, day, dayNumber } = entry;
  const items = [...day.items].sort((a, b) => a.time.localeCompare(b.time));

  // Latest item that has started, if it started recently enough to still be going.
  let currentIndex = -1;
  let nextIndex = -1;
  if (nowTime) {
    const started = items.filter((i) => i.time <= nowTime).length - 1;
    if (started >= 0 && minutes(nowTime) - minutes(items[started].time) <= NOW_WINDOW_MINUTES) currentIndex = started;
    nextIndex = started + 1 < items.length ? started + 1 : -1;
  }

  return (
    <Card>
      <Link href={`/trips/${trip.id}`} asChild>
        <Pressable style={styles.tripLink} accessibilityRole="link">
          <View style={{ flex: 1 }}>
            <ThemedText type="heading">{trip.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {trip.destination} · Day {dayNumber} of {trip.days.length}
              {day.theme ? ` · ${day.theme}` : ''}
            </ThemedText>
          </View>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={theme.textSecondary} size={14} />
        </Pressable>
      </Link>

      <View style={styles.timeline}>
        {items.map((item, i) => {
          const past = !!nowTime && i < (currentIndex >= 0 ? currentIndex : nextIndex >= 0 ? nextIndex : items.length);
          return (
            <View key={item.id}>
              {nowTime && i === nextIndex && <NowLine time={nowTime} />}
              <TimelineRow
                item={item}
                state={i === currentIndex ? 'now' : i === nextIndex ? 'next' : past ? 'past' : 'later'}
                last={i === items.length - 1}
              />
            </View>
          );
        })}
        {nowTime && nextIndex === -1 && currentIndex === -1 && items.length > 0 && (
          <ThemedText type="accent" themeColor="textSecondary" style={styles.dayDone}>
            That&apos;s a wrap for today.
          </ThemedText>
        )}
      </View>
    </Card>
  );
}

type RowState = 'past' | 'now' | 'next' | 'later';

function TimelineRow({ item, state, last }: { item: ItineraryItem; state: RowState; last: boolean }) {
  const theme = useTheme();
  const highlighted = state === 'now' || state === 'next';
  const muted = state === 'past';
  return (
    <View style={styles.row}>
      <ThemedText
        type={highlighted ? 'smallBold' : 'small'}
        themeColor={muted ? 'textSecondary' : 'text'}
        style={styles.time}>
        {formatTime(item.time)}
      </ThemedText>

      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            { borderColor: muted ? theme.border : theme.accent },
            highlighted && { backgroundColor: state === 'now' ? theme.accent : theme.backgroundElement },
            state === 'now' && styles.dotNow,
          ]}
        />
        {!last && <View style={[styles.line, { backgroundColor: theme.border }]} />}
      </View>

      <View
        style={[
          styles.content,
          highlighted && { backgroundColor: theme.backgroundSelected, borderRadius: 14, padding: Spacing.two + 2 },
        ]}>
        {highlighted && (
          <ThemedText type="accent" style={{ color: theme.tint, fontSize: 16, lineHeight: 20 }}>
            {state === 'now' ? 'Happening now' : 'Up next'}
          </ThemedText>
        )}
        <ThemedText themeColor={muted ? 'textSecondary' : 'text'}>
          {CATEGORY_ICON[item.category]} {item.title}
        </ThemedText>
        {!!item.place_name && item.place_name !== item.title && (
          <ThemedText type="small" themeColor="textSecondary">
            {item.place_name}
          </ThemedText>
        )}
        {!!item.notes && (
          <ThemedText type="small" themeColor="textSecondary">
            {item.notes}
          </ThemedText>
        )}
        <View style={styles.meta}>
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
    </View>
  );
}

function NowLine({ time }: { time: string }) {
  const theme = useTheme();
  return (
    <View style={styles.nowLine} accessibilityLabel={`Now, ${formatTime(time)}`}>
      <ThemedText type="smallBold" style={[styles.time, { color: theme.accent }]}>
        Now
      </ThemedText>
      <View style={[styles.nowDot, { backgroundColor: theme.accent }]} />
      <View style={[styles.nowRule, { backgroundColor: theme.accent }]} />
    </View>
  );
}

const TIME_WIDTH = 68;
const RAIL_WIDTH = 20;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.one },
  headerText: { alignItems: 'center', flex: 1 },
  headerDate: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  todayRow: { alignItems: 'center' },
  tripLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  timeline: { gap: 0 },
  row: { flexDirection: 'row', gap: Spacing.two },
  time: { width: TIME_WIDTH, fontVariant: ['tabular-nums'], paddingTop: 2 },
  rail: { width: RAIL_WIDTH, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 6 },
  dotNow: { width: 14, height: 14, borderRadius: 7 },
  line: { width: 2, flex: 1, marginTop: 2, borderRadius: 1 },
  content: { flex: 1, gap: 2, paddingBottom: Spacing.three },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  nowLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  nowDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: (RAIL_WIDTH - 8) / 2 },
  nowRule: { flex: 1, height: 2, borderRadius: 1 },
  dayDone: { textAlign: 'center', paddingTop: Spacing.one },
});
