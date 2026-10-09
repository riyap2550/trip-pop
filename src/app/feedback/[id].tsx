import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackForm } from '@/components/feedback-form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, formatDateRange } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

/**
 * "How was your trip?" sheet, opened automatically by <FeedbackPrompt> once a trip is over.
 * It's a navigation modal (like Profile) so iOS sheet gestures and the rest of the app stay in sync.
 * Closing it without rating, including swiping it down, counts as "Maybe later" (FeedbackPrompt handles that).
 */
export default function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { dismissFeedback, refresh } = useAgentActivity();
  const { data: trip, error } = useApi(() => api.trip(id));
  const [thanks, setThanks] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        <View style={[styles.hero, { backgroundColor: theme.hero }]}>
          <View style={[styles.sun, { backgroundColor: theme.accent }]} />
          <View style={styles.heroTop}>
            <ThemedText type="accent" style={{ color: theme.heroMuted }}>
              {thanks ? 'Thank you' : 'Welcome home'}
            </ThemedText>
            {!thanks && (
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
                <ThemedText type="smallBold" style={{ color: theme.heroText }}>
                  Maybe later
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText type="subtitle" style={{ color: theme.heroText }}>
            {thanks ? 'Noted for next time' : trip ? `How was ${trip.destination}?` : 'How was your trip?'}
          </ThemedText>
          {trip && (
            <ThemedText type="small" style={{ color: theme.heroMuted }}>
              {trip.title} · {formatDateRange(trip.start_date, trip.end_date)}
            </ThemedText>
          )}
        </View>

        <ErrorText message={error} />

        {thanks !== null ? (
          <Card>
            <ThemedText>{thanks}</ThemedText>
            {/* dismissFeedback already ran, so leaving for the share sheet won't snooze this trip */}
            {trip && (trip.membership?.role === 'owner' || trip.privacy !== 'private') && (
              <Button
                title="Share with friends"
                onPress={() => router.replace({ pathname: '/share-trip/[id]', params: { id, from: 'feedback' } })}
              />
            )}
            <View style={styles.row}>
              <Button title="Done" onPress={close} />
              <Button
                title="View trip"
                variant="secondary"
                onPress={() => {
                  close();
                  router.navigate(`/trips/${id}`, { withAnchor: true });
                }}
              />
            </View>
          </Card>
        ) : (
          trip && (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                A quick rating helps me plan trips that fit you even better. It only takes a moment.
              </ThemedText>
              <FeedbackForm
                trip={trip}
                onDone={(job) => {
                  dismissFeedback(id);
                  refresh();
                  setThanks(job.result?.summary ?? 'Thanks! Your travel profile is updated.');
                }}
              />
            </Card>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingTop: Spacing.four },
  hero: { borderRadius: 24, padding: Spacing.four, gap: Spacing.two, overflow: 'hidden' },
  sun: { position: 'absolute', width: 200, height: 200, borderRadius: 100, right: -60, bottom: -110, opacity: 0.35 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: Spacing.two },
});
