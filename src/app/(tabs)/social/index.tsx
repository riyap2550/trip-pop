import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FeedPostCard } from '@/components/social/feed-post-card';
import { FriendsPanel } from '@/components/social/friends-panel';
import { SocialProfileView } from '@/components/social/social-profile-view';
import { Button, Chip, EmptyState, ErrorText, Screen, Segmented } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/hooks/use-auth';
import { api, type FeedPost } from '@/lib/api';

type SocialView = 'feed' | 'friends' | 'profile';

const VIEWS = ['feed', 'friends', 'profile'] as const;
const PAGE_SIZE = 20;

export default function SocialScreen() {
  const params = useLocalSearchParams<{ view?: SocialView }>();
  const [view, setView] = useState<SocialView>(VIEWS.includes(params.view as SocialView) ? (params.view as SocialView) : 'feed');

  // Each view is only mounted while selected, so it only fetches then.
  return (
    <Screen>
      <Segmented
        options={VIEWS}
        labels={{ feed: 'Feed', friends: 'Friends', profile: 'Profile' }}
        value={view}
        onChange={setView}
      />
      {view === 'feed' && <FeedView />}
      {view === 'friends' && <FriendsPanel />}
      {view === 'profile' && <MyProfile />}
    </Screen>
  );
}

function FeedView() {
  const { data: firstPage, error } = useApi(() => api.feed());
  const [older, setOlder] = useState<FeedPost[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  if (!firstPage) return <ErrorText message={error} />;

  // The first page reloads when anything changes; pages loaded later are kept, without repeats.
  const byId = new Map([...firstPage, ...older].filter((p) => !deleted.has(p.id)).map((p) => [p.id, p]));
  const posts = [...byId.values()];
  const canLoadMore = !exhausted && firstPage.length >= PAGE_SIZE;

  const loadMore = async () => {
    const last = posts.at(-1);
    if (!last) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.feed(last.created_at);
      setOlder((list) => [...list, ...page]);
      if (page.length < PAGE_SIZE) setExhausted(true);
    } catch (e) {
      setMoreError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (posts.length === 0) {
    return (
      <>
        <ErrorText message={error} />
        <EmptyState title="Nothing here yet" body="Add friends to see their trips here" />
      </>
    );
  }

  return (
    <>
      <ErrorText message={error} />
      {posts.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          onDeleted={() => setDeleted((ids) => new Set(ids).add(post.id))}
        />
      ))}
      <ErrorText message={moreError} />
      {canLoadMore && <Button title="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />}
    </>
  );
}

function MyProfile() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;
  return (
    <>
      <View style={styles.editRow}>
        <Chip label="Edit travel preferences" onPress={() => router.push('/profile')} />
      </View>
      <SocialProfileView userId={auth.user.id} />
    </>
  );
}

const styles = StyleSheet.create({
  editRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
