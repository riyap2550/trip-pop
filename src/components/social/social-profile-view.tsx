import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FriendButton } from '@/components/social/friends-panel';
import { TripSummaryCard } from '@/components/social/trip-summary-card';
import { UserAvatar } from '@/components/social/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, ErrorText, SectionTitle } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

/** Someone's travels as the viewer is allowed to see them: only trips whose privacy lets the viewer in. */
export function SocialProfileView({ userId }: { userId: string }) {
  const { data: profile, error, reload } = useApi(() => api.socialProfile(userId));
  const [actionError, setActionError] = useState<string | null>(null);

  if (!profile) return <ErrorText message={error} />;

  const stats: [string, number][] = [
    ['Trips', profile.stats.trips],
    ['Countries', profile.stats.countries],
    ['Friends', profile.stats.friends],
    ['Photos', profile.stats.photos],
  ];

  return (
    <View style={styles.container}>
      <Card style={styles.header}>
        <UserAvatar userId={profile.user.id} name={profile.user.display_name} size={88} />
        <ThemedText type="subtitle">{profile.user.display_name || 'Traveler'}</ThemedText>
        <View style={styles.stats}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <ThemedText type="heading">{value}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {label}
              </ThemedText>
            </View>
          ))}
        </View>
        {!profile.is_me && (
          <FriendButton
            card={{ ...profile.user, friendship: profile.friendship, request_id: profile.request_id }}
            onChange={() => reload()}
            onError={setActionError}
          />
        )}
        <ErrorText message={actionError ?? error} />
      </Card>

      <SectionTitle>Trips</SectionTitle>
      {profile.trips.length === 0 ? (
        <EmptyState
          title="No trips to show"
          body={profile.is_me ? 'Trips you plan or join show up here.' : "Nothing shared with you yet."}
        />
      ) : (
        profile.trips.map((trip) => <TripSummaryCard key={trip.id} trip={trip} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  header: { alignItems: 'center' },
  stats: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around', paddingTop: Spacing.two },
  stat: { alignItems: 'center' },
});
