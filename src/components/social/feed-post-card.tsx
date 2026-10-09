import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { PhotoThumb } from '@/components/photos/photo-thumb';
import { openTripSummary } from '@/components/social/trip-summary-card';
import { UserAvatar } from '@/components/social/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText, formatDate, formatDateRange } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type FeedPost } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

const THUMB = 72;

export function FeedPostCard({ post, onDeleted }: { post: FeedPost; onDeleted?: () => void }) {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { trip } = post;

  const confirmDelete = () =>
    Alert.alert('Delete this post?', 'The trip itself stays as it is.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePost(post.id);
            emitDataChanged();
            onDeleted?.();
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);

  return (
    <Card>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push({ pathname: '/social/user/[id]', params: { id: post.author.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${post.author.display_name}'s profile`}
          style={({ pressed }) => [styles.author, { opacity: pressed ? 0.7 : 1 }]}>
          <UserAvatar userId={post.author.id} name={post.author.display_name} size={36} />
          <View style={styles.authorText}>
            <ThemedText type="smallBold">{post.author.display_name || 'Traveler'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(post.created_at)}
            </ThemedText>
          </View>
        </Pressable>
        {post.can_delete && (
          <Pressable onPress={confirmDelete} hitSlop={8} accessibilityRole="button">
            <ThemedText type="small" style={{ color: theme.danger }}>
              Delete
            </ThemedText>
          </Pressable>
        )}
      </View>

      {!!post.caption && <ThemedText>{post.caption}</ThemedText>}

      <Pressable
        onPress={() => openTripSummary(trip)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.trip, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.75 : 1 }]}>
        <ThemedText type="heading">{trip.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {trip.destination}, {trip.country} · {formatDateRange(trip.start_date, trip.end_date)}
        </ThemedText>
        {trip.rating !== null && (
          <ThemedText type="small" style={{ color: theme.warning }} accessibilityLabel={`Rated ${trip.rating} of 5`}>
            {'★'.repeat(trip.rating)}
          </ThemedText>
        )}
      </Pressable>

      {post.photos.length > 0 && (
        <View style={styles.photos}>
          {post.photos.slice(0, 4).map((photo) => (
            <PhotoThumb
              key={photo.id}
              photo={photo}
              size={THUMB}
              onPress={() => router.push({ pathname: '/photo/[id]', params: { id: photo.id } })}
            />
          ))}
        </View>
      )}
      <ErrorText message={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  author: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  authorText: { flexShrink: 1 },
  trip: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  photos: { flexDirection: 'row', gap: Spacing.two },
});
