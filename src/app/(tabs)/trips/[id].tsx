import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { BookingLink } from '@/components/booking-link';
import { CollaboratorAvatars } from '@/components/collaborator-avatars';
import { FeedbackForm } from '@/components/feedback-form';
import { HoldCard } from '@/components/hold-card';
import { ItineraryItemRow } from '@/components/itinerary-item';
import { TripPhotos } from '@/components/photos/trip-photos';
import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Chip,
  ErrorText,
  formatDate,
  formatDateRange,
  money,
  Pill,
  Screen,
  SectionTitle,
} from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { useTripSync } from '@/hooks/use-trip-sync';
import { api, type ItineraryEvent, type TripDetail } from '@/lib/api';
import { isDayTrip, isoDate } from '@/lib/dates';
import { TRIP_PRIVACY, TRIP_STATUS } from '@/lib/labels';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { data: trip, error, refreshing, refresh, setData } = useApi(() => api.trip(id));
  const { data: members } = useApi(() => api.tripMembers(id));
  const { data: events } = useApi(() => api.tripEvents(id), 10000);
  const { promptFeedback } = useAgentActivity();
  const [editing, setEditing] = useState(false);

  useTripSync(id);

  if (!trip) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const status = TRIP_STATUS[trip.status];
  const active = trip.status !== 'completed' && trip.status !== 'awaiting_feedback';
  const started = trip.start_date.slice(0, 10) <= isoDate(new Date());
  const pendingHolds = trip.holds.filter((h) => h.status === 'pending_approval');
  const openDocs = trip.documents.filter((d) => d.action_required && !d.done);
  const openItem = (date: string, item?: string) =>
    router.push({ pathname: '/edit-item/[id]', params: { id: trip.id, date, ...(item && { item }) } });

  const myRole = trip.membership?.role ?? 'viewer';
  const isOwner = myRole === 'owner';
  const canEdit = myRole === 'owner' || myRole === 'editor';

  const recentEvents = (events ?? []).slice(0, 3);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: trip.destination }} />

      <Card>
        <View style={styles.row}>
          <ThemedText type="heading" style={{ flex: 1, fontSize: 28, lineHeight: 34 }}>
            {trip.title}
          </ThemedText>
          <Pill label={status.label} color={theme[status.tone]} />
          <Pill label={TRIP_PRIVACY[trip.privacy].label} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
          {isDayTrip(trip) ? ' · Day trip' : ''} · {trip.travelers} traveler{trip.travelers > 1 ? 's' : ''}
        </ThemedText>
        {members && members.length > 0 && (
          <CollaboratorAvatars
            members={members}
            onPress={() => router.push({ pathname: '/trip-members/[id]', params: { id: trip.id } })}
          />
        )}
        <View style={styles.row}>
          {isOwner && (
            <Button
              title="Invite others"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/trip-members/[id]', params: { id: trip.id, title: trip.title } })
              }
            />
          )}
          <Button
            title="Share"
            variant="secondary"
            onPress={() => router.push({ pathname: '/share-trip/[id]', params: { id: trip.id } })}
          />
        </View>
        <ThemedText type="small">{trip.summary}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Why it fits: {trip.why_it_fits}
        </ThemedText>
        {active && (
          <>
            <Button
              title="Chat with your agent"
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: trip.id } })}
            />
            {canEdit && (
              <Button
                title="Edit dates & details"
                variant="secondary"
                onPress={() => router.push({ pathname: '/edit-trip/[id]', params: { id: trip.id } })}
              />
            )}
          </>
        )}
      </Card>

      <CostCard trip={trip} />

      {trip.status === 'awaiting_feedback' && (
        <FeedbackCard
          trip={trip}
          onDone={() => {
            refresh();
            // Only the owner can open up a private trip, so don't offer sharing to anyone else
            if (isOwner || trip.privacy !== 'private') {
              Alert.alert('Share this trip?', 'Let friends see where you went.', [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Share',
                  onPress: () =>
                    router.push({ pathname: '/share-trip/[id]', params: { id: trip.id, from: 'feedback' } }),
                },
              ]);
            }
          }}
        />
      )}
      {trip.feedback && (
        <Card>
          <ThemedText type="heading">Your feedback · {'★'.repeat(trip.feedback.rating)}</ThemedText>
          <ThemedText type="small">{trip.feedback.agent_summary}</ThemedText>
        </Card>
      )}

      {pendingHolds.length > 0 && <SectionTitle>Waiting for your approval</SectionTitle>}
      {pendingHolds.map((hold) => (
        <HoldCard
          key={hold.id}
          hold={hold}
          readOnly={!canEdit}
          onChange={(h) => setData({ ...trip, holds: trip.holds.map((x) => (x.id === h.id ? h : x)) })}
        />
      ))}

      {recentEvents.length > 0 && (
        <View style={styles.eventChips}>
          {recentEvents.map((event: ItineraryEvent) => (
            <View key={event.id} style={[styles.eventChip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eventChipText}>
                {event.author_name}: {event.summary}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.sectionRow}>
        <SectionTitle>Itinerary</SectionTitle>
        {active && canEdit && (
          <Chip
            label={editing ? 'Done' : 'Edit itinerary'}
            selected={editing}
            onPress={() => setEditing(!editing)}
          />
        )}
      </View>
      {editing && (
        <ThemedText type="small" themeColor="textSecondary">
          Tap an item to change it, or add your own to any day.
        </ThemedText>
      )}
      {trip.days.map((day) => (
        <Card key={day.date}>
          <ThemedText type="smallBold">
            {formatDate(day.date)}
            {day.theme ? ` · ${day.theme}` : ''}
          </ThemedText>
          {day.items.map((item) => (
            <ItineraryItemRow
              key={item.id}
              item={item}
              onEdit={editing ? () => openItem(day.date, item.id) : undefined}
            />
          ))}
          {day.items.length === 0 && !editing && active && (
            <View style={styles.openDay}>
              <ThemedText type="accent" themeColor="textSecondary">
                Nothing planned yet
              </ThemedText>
              <Chip
                label="Plan it with my agent"
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: trip.id, prefill: `Plan ${formatDate(day.date)} for me` },
                  })
                }
              />
            </View>
          )}
          {editing && <Chip label="+ Add to this day" onPress={() => openItem(day.date)} />}
        </Card>
      ))}

      <SectionTitle>Photos</SectionTitle>
      <TripPhotos tripId={trip.id} days={trip.days} canUpload={canEdit} />

      {trip.changes.length > 0 && <SectionTitle>Changes made on the go</SectionTitle>}
      {trip.changes.map((c) => (
        <Card key={c.at}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(c.date)} · “{c.reason}”
          </ThemedText>
          <ThemedText type="small">{c.summary}</ThemedText>
        </Card>
      ))}

      <SectionTitle>Documents & deadlines</SectionTitle>
      <Card>
        {trip.documents.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {trip.documents_checked_at ? 'No requirements found.' : 'Checking entry requirements…'}
          </ThemedText>
        ) : (
          <ThemedText type="small">
            {openDocs.length
              ? `${openDocs.length} thing${openDocs.length > 1 ? 's' : ''} to do before you go. Next deadline: ${formatDate(openDocs[0].deadline)}.`
              : 'All documents are in order.'}
          </ThemedText>
        )}
        <Button title="Open document tracker" variant="secondary" onPress={() => router.navigate('/docs')} />
      </Card>

      <View style={styles.row}>
        {active && started && isOwner && (
          <Button
            title="Trip's over"
            variant="secondary"
            onPress={async () => {
              const ended = await api.endTrip(trip.id);
              setData({ ...trip, ...ended });
              // Open the feedback prompt now instead of on the next background sync.
              if (ended.status === 'awaiting_feedback') promptFeedback(ended);
            }}
          />
        )}
        {isOwner && (
          <Button
            title="Delete trip"
            variant="danger"
            onPress={() =>
              Alert.alert('Delete this trip?', 'Its price watches, holds, and reminders are removed too.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await api.deleteTrip(trip.id);
                    router.back();
                  },
                },
              ])
            }
          />
        )}
      </View>
    </Screen>
  );
}

function CostCard({ trip }: { trip: TripDetail }) {
  const theme = useTheme();
  const over = trip.costs.total - trip.budget_usd;
  // No booking link means nothing to book: no flight on ground trips, no hotel on day trips.
  const rows: [string, number, string | null][] = [
    ...(trip.booking_links.flight ? [['Flights', trip.costs.flights, trip.booking_links.flight] as [string, number, string]] : []),
    ...(trip.booking_links.hotel ? [['Hotel', trip.costs.hotel, trip.booking_links.hotel] as [string, number, string]] : []),
    ['Food', trip.costs.food, null],
    ['Activities & transport', trip.costs.activities, null],
  ];
  return (
    <Card>
      {rows.map(([label, amount, url]) => (
        <View key={label} style={styles.costRow}>
          <ThemedText type="small" style={{ flex: 1 }}>
            {label}
          </ThemedText>
          <BookingLink url={url} />
          <ThemedText type="small" style={styles.amount}>
            {money(amount)}
          </ThemedText>
        </View>
      ))}
      <View style={[styles.costRow, styles.totalRow, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          Estimated total
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.amount, over > 0 && { color: theme.danger }]}>
          {money(trip.costs.total)}
        </ThemedText>
      </View>
      <ThemedText type="small" style={{ color: over > 0 ? theme.danger : theme.success }}>
        {over > 0 ? `${money(over)} over` : `${money(-over)} under`} your {money(trip.budget_usd)} budget
      </ThemedText>
    </Card>
  );
}

function FeedbackCard({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ borderWidth: 1, borderColor: theme.warning }}>
      <ThemedText type="heading">How was {trip.destination}?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your answers update your travel profile, so future plans fit you better.
      </ThemedText>
      <FeedbackForm trip={trip} onDone={onDone} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openDay: { gap: Spacing.two, alignItems: 'flex-start' },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  amount: { minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  eventChips: { gap: Spacing.one },
  eventChip: { borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  eventChipText: { fontSize: 12 },
});
