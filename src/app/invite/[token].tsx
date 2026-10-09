import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type InviteInfo } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const theme = useTheme();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .inviteInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load invite.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await api.acceptInvite(token);
      router.replace({ pathname: '/(tabs)/trips/[id]', params: { id: result.trip_id } }, { withAnchor: true });
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept invite.');
      setAccepting(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Trip Invite' }} />

      {loadError && (
        <Card>
          <ErrorText message={loadError} />
        </Card>
      )}

      {info && (
        <Card>
          <ThemedText type="heading">{info.trip_title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {info.inviter_name} invited you to join as{' '}
            <ThemedText type="smallBold">{ROLE_LABELS[info.role] ?? info.role}</ThemedText>
          </ThemedText>

          {info.expired ? (
            <View style={styles.expiredBox}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                This invite link has expired. Ask the trip owner for a new one.
              </ThemedText>
            </View>
          ) : (
            <>
              {acceptError && <ErrorText message={acceptError} />}
              <Button title="Accept invite" onPress={handleAccept} loading={accepting} />
            </>
          )}
        </Card>
      )}

      {!info && !loadError && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Loading invite…
          </ThemedText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  expiredBox: {
    paddingVertical: Spacing.two,
  },
});
