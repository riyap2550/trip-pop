import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { PrivacyPicker } from '@/components/social/privacy-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, formatDateRange, Input, Screen, SectionTitle } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { api, type TripPrivacy } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

const MAX_CAPTION = 500;

/** Post a trip to friends' feeds, or share a plain-text summary outside TripPop. Opened by any traveler on the trip. */
export default function ShareTripScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { data: trip, error, setData } = useApi(() => api.trip(id));
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!trip) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const isOwner = trip.membership?.role === 'owner';
  const isPrivate = trip.privacy === 'private';

  const changePrivacy = async (privacy: TripPrivacy) => {
    setActionError(null);
    const previous = trip.privacy;
    setData({ ...trip, privacy });
    try {
      await api.updatePrivacy(trip.id, privacy);
      emitDataChanged();
    } catch (e) {
      setData({ ...trip, privacy: previous });
      setActionError((e as Error).message);
    }
  };

  const postToFeed = async () => {
    setPosting(true);
    setActionError(null);
    try {
      await api.createPost(trip.id, { caption: caption.trim() });
      emitDataChanged();
      setPosted(true);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  // Plain text only: trippop:// and exp:// links aren't tappable in Messages or WhatsApp.
  const shareOutside = async () => {
    const stars = trip.feedback?.rating ? ` ${'★'.repeat(trip.feedback.rating)}` : '';
    const message =
      `${trip.title}: ${trip.destination}, ${trip.country} · ` +
      `${formatDateRange(trip.start_date, trip.end_date)}.${stars} Planned with TripPop.`;
    try {
      await Share.share({ message });
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  if (posted) {
    return (
      <Screen>
        <Card>
          <ThemedText type="heading">Posted</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {trip.privacy === 'public'
              ? 'Your trip is on your profile and in your friends’ feeds.'
              : 'Friends of everyone on this trip can see it in their feeds.'}
          </ThemedText>
          <Button title="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.heading}>
        <ThemedText type="subtitle">
          {from === 'feedback' ? `Share ${trip.destination} with friends?` : `Share ${trip.title}`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
        </ThemedText>
      </View>

      <Input
        value={caption}
        onChangeText={setCaption}
        placeholder="Say something about the trip"
        multiline
        maxLength={MAX_CAPTION}
      />

      <SectionTitle>Who can see it</SectionTitle>
      <PrivacyPicker value={trip.privacy} onChange={changePrivacy} disabled={!isOwner} />
      {!isOwner && isPrivate && (
        <ThemedText type="small" themeColor="textSecondary">
          The trip owner has made this trip private.
        </ThemedText>
      )}

      <ErrorText message={actionError} />
      <Button title="Post to Feed" loading={posting} disabled={isPrivate} onPress={postToFeed} />
      <Button title="Share outside TripPop" variant="secondary" onPress={shareOutside} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.one },
});
