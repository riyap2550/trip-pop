import { Pressable, StyleSheet, View } from 'react-native';

import { UserAvatar } from '@/components/social/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripMember } from '@/lib/api';

const AVATAR_SIZE = 32;
const OVERLAP = 10;

function Avatar({ member, index }: { member: TripMember; index: number }) {
  return (
    <View
      style={[styles.avatar, { marginLeft: index === 0 ? 0 : -OVERLAP, zIndex: index }]}
      accessibilityLabel={`${member.display_name} (${member.role})`}>
      <UserAvatar
        userId={member.user_id}
        name={member.display_name}
        avatarUrl={member.avatar_url}
        size={AVATAR_SIZE - 4}
      />
    </View>
  );
}

export function CollaboratorAvatars({
  members,
  onPress,
}: {
  members: TripMember[];
  onPress?: () => void;
}) {
  const theme = useTheme();
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;

  const content = (
    <View style={styles.row}>
      {visible.map((member, i) => (
        <Avatar key={member.user_id} member={member} index={i} />
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.avatar,
            styles.overflow,
            {
              backgroundColor: theme.backgroundSelected,
              marginLeft: -OVERLAP,
              zIndex: visible.length,
            },
          ]}>
          <ThemedText type="small" style={[styles.initials, { color: theme.text }]}>
            +{overflow}
          </ThemedText>
        </View>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {members.length} member{members.length !== 1 ? 's' : ''}
      </ThemedText>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View trip members"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFDFC',
  },
  overflow: {
    borderWidth: 1,
  },
  initials: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  label: {
    marginLeft: Spacing.two,
  },
});
