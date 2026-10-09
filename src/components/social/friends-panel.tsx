import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { UserAvatar } from '@/components/social/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, ErrorText, Input, SectionTitle } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { api, type UserCard } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

const SEARCH_DEBOUNCE_MS = 300;

const openProfile = (userId: string) => router.push({ pathname: '/social/user/[id]', params: { id: userId } });

/**
 * The one friendship action that fits where things stand: Add, Requested (tap to cancel), Accept, or Friends.
 * Calls `onChange` with the person's new card so the caller can update in place.
 */
export function FriendButton({
  card,
  onChange,
  onError,
}: {
  card: UserCard;
  onChange: (next: UserCard) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<UserCard>) => {
    setBusy(true);
    try {
      onChange(await action());
      emitDataChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  switch (card.friendship) {
    case 'none':
      return <Chip label="Add" disabled={busy} onPress={() => run(() => api.sendFriendRequest(card.id))} />;
    case 'outgoing':
      return (
        <Chip
          label="Requested"
          selected
          disabled={busy}
          onPress={() =>
            run(async () => {
              await api.cancelFriendRequest(card.request_id ?? '');
              return { ...card, friendship: 'none', request_id: null };
            })
          }
        />
      );
    case 'incoming':
      return <Chip label="Accept" disabled={busy} onPress={() => run(() => api.acceptFriendRequest(card.request_id ?? ''))} />;
    case 'friends':
      return <Chip label="Friends" selected disabled onPress={() => {}} />;
  }
}

/** Find people, answer requests, and manage friends. */
export function FriendsPanel() {
  const { data: overview, error: loadError } = useApi(api.friends);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      api.searchUsers(q).then(
        (found) => !stale && setResults(found),
        (e: Error) => !stale && setError(e.message),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const updateResult = (next: UserCard) =>
    setResults((list) => list?.map((u) => (u.id === next.id ? next : u)) ?? null);

  // Requests and friends below reload on their own through emitDataChanged.
  const act = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      emitDataChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirmRemove = (friend: UserCard) =>
    Alert.alert(`Remove ${friend.display_name || 'this friend'}?`, "You'll stop seeing each other's friends-only trips.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(() => api.removeFriend(friend.id)) },
    ]);

  return (
    <View style={styles.panel}>
      <Input
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (text.trim().length < 2) setResults(null);
        }}
        placeholder="Search by name or exact email"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <ErrorText message={error ?? loadError} />

      {searching && results && (
        <Card>
          {results.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No one found.
            </ThemedText>
          ) : (
            results.map((user) => (
              <PersonRow key={user.id} user={user}>
                <FriendButton card={user} onChange={updateResult} onError={setError} />
              </PersonRow>
            ))
          )}
        </Card>
      )}

      {!!overview?.incoming.length && (
        <>
          <SectionTitle>Requests</SectionTitle>
          <Card>
            {overview.incoming.map((request) => (
              <PersonRow key={request.id} user={request.user}>
                <Chip label="Accept" selected onPress={() => act(() => api.acceptFriendRequest(request.id))} />
                <Chip label="Decline" onPress={() => act(() => api.declineFriendRequest(request.id))} />
              </PersonRow>
            ))}
          </Card>
        </>
      )}

      {!!overview?.outgoing.length && (
        <>
          <SectionTitle>Sent</SectionTitle>
          <Card>
            {overview.outgoing.map((request) => (
              <PersonRow key={request.id} user={request.user}>
                <Chip label="Cancel" onPress={() => act(() => api.cancelFriendRequest(request.id))} />
              </PersonRow>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Friends</SectionTitle>
      <Card>
        {overview && overview.friends.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No friends yet. Search above to find people you travel with.
          </ThemedText>
        )}
        {overview?.friends.map((friend) => (
          <PersonRow key={friend.id} user={friend}>
            <Chip label="Remove" onPress={() => confirmRemove(friend)} />
          </PersonRow>
        ))}
      </Card>
    </View>
  );
}

/** Avatar and name (tap for their profile), with actions on the right. */
function PersonRow({ user, children }: { user: UserCard; children: ReactNode }) {
  return (
    <View style={styles.person}>
      <Pressable
        onPress={() => openProfile(user.id)}
        accessibilityRole="button"
        accessibilityLabel={`${user.display_name}'s profile`}
        style={({ pressed }) => [styles.who, { opacity: pressed ? 0.7 : 1 }]}>
        <UserAvatar userId={user.id} name={user.display_name} avatarUrl={user.avatar_url} size={36} />
        <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
          {user.display_name || 'Traveler'}
        </ThemedText>
      </Pressable>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.three },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
