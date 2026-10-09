import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  ErrorText,
  Pill,
  Screen,
  Segmented,
  SectionTitle,
} from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type MemberRole, type TripMember } from '@/lib/api';

const ROLE_OPTIONS = ['editor', 'viewer'] as const satisfies readonly MemberRole[];
const ROLE_LABELS: Partial<Record<MemberRole, string>> = {
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_PILL_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export default function TripMembersScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const theme = useTheme();
  const { data: members, error, refreshing, refresh } = useApi(() => api.tripMembers(id));

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const currentUserIsOwner = members?.some((m) => m.role === 'owner') ?? false;

  async function handleInvite() {
    setInviting(true);
    setInviteError(null);
    try {
      const { token } = await api.inviteCollaborator(id, inviteRole);
      // Built on the client so the link opens in whatever is running this app:
      // exp://…/--/invite/<token> in Expo Go, trippop://invite/<token> in a build.
      const url = Linking.createURL(`invite/${token}`);
      const trip = title ? `"${title}"` : 'my trip';
      // Opens the system share sheet: WhatsApp, Messages, Mail, copy, etc.
      await Share.share({
        message: `Join ${trip} on TripPop: ${url}`,
        title: 'Join my trip on TripPop',
      });
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to create invite.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: TripMember) {
    setRemovingId(member.user_id);
    setActionError(null);
    try {
      await api.removeMember(id, member.user_id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRoleToggle(member: TripMember) {
    const nextRole: MemberRole = member.role === 'editor' ? 'viewer' : 'editor';
    setRoleUpdatingId(member.user_id);
    setActionError(null);
    try {
      await api.updateMemberRole(id, member.user_id, nextRole);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setRoleUpdatingId(null);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: 'Trip Members' }} />

      {currentUserIsOwner && (
        <>
          <SectionTitle>Invite others</SectionTitle>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Send a link by WhatsApp, Messages, or anywhere else. Each link works once and
              expires in 48 hours.
            </ThemedText>
            <Segmented
              options={ROLE_OPTIONS}
              value={inviteRole}
              onChange={setInviteRole}
              labels={ROLE_LABELS}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {inviteRole === 'editor'
                ? 'Editors can change the itinerary.'
                : 'Viewers can see the trip but not change it.'}
            </ThemedText>
            {inviteError && <ErrorText message={inviteError} />}
            <Button title="Share invite link" onPress={handleInvite} loading={inviting} />
          </Card>
        </>
      )}

      <SectionTitle>Members</SectionTitle>
      {error && <ErrorText message={error} />}
      {actionError && <ErrorText message={actionError} />}

      {(members ?? []).map((member) => (
        <Card key={member.user_id}>
          <View style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <ThemedText type="small">{member.display_name || 'Unknown'}</ThemedText>
              <Pill
                label={ROLE_PILL_LABELS[member.role]}
                color={member.role === 'owner' ? theme.accent : theme.textSecondary}
              />
            </View>
            {currentUserIsOwner && member.role !== 'owner' && (
              <View style={styles.memberActions}>
                <Button
                  title={member.role === 'editor' ? 'Make Viewer' : 'Make Editor'}
                  variant="secondary"
                  loading={roleUpdatingId === member.user_id}
                  onPress={() => handleRoleToggle(member)}
                />
                <Button
                  title="Remove"
                  variant="danger"
                  loading={removingId === member.user_id}
                  onPress={() => handleRemove(member)}
                />
              </View>
            )}
          </View>
        </Card>
      ))}

    </Screen>
  );
}

const styles = StyleSheet.create({
  memberRow: {
    gap: Spacing.two,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  memberActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
