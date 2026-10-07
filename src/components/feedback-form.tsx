import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ToolCallStatus } from '@/components/tool-call-status';
import { Button, ErrorText, Input } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useJob } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type Job, type Trip } from '@/lib/api';

const RATING_WORDS = ['', 'Not great', 'It was okay', 'Pretty good', 'Loved it', 'Unforgettable'];

/** Star rating plus "what worked / what didn't". Sending it lets the agent update the travel profile. */
export function FeedbackForm({ trip, onDone }: { trip: Trip; onDone: (job: Job) => void }) {
  const theme = useTheme();
  const [rating, setRating] = useState(0);
  const [worked, setWorked] = useState('');
  const [didnt, setDidnt] = useState('');
  const job = useJob(onDone);
  const busy = job.running;

  return (
    <View style={styles.form}>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel="Rating" accessibilityValue={{ min: 0, max: 5, now: rating }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            accessibilityState={{ selected: n <= rating }}>
            <ThemedText style={[styles.star, { color: n <= rating ? theme.warning : theme.border }]}>★</ThemedText>
          </Pressable>
        ))}
      </View>
      <ThemedText type="accent" themeColor="textSecondary" style={styles.ratingWord}>
        {RATING_WORDS[rating] || 'Tap to rate'}
      </ThemedText>

      <Input value={worked} onChangeText={setWorked} placeholder="What worked?" multiline editable={!busy} />
      <Input value={didnt} onChangeText={setDidnt} placeholder="What didn't?" multiline editable={!busy} />
      <Button
        title="Send feedback"
        disabled={!rating}
        loading={busy}
        onPress={() => job.start(() => api.feedback(trip.id, { rating, what_worked: worked, what_didnt: didnt }))}
      />
      <ErrorText message={job.error} />
      {job.job && busy && <ToolCallStatus job={job.job} title="Learning from your trip" />}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two + 2 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  star: { fontSize: 40, lineHeight: 48 },
  ratingWord: { textAlign: 'center', marginTop: -Spacing.one },
});
