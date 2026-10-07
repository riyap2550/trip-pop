import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripMember } from '@/lib/api';

const AVATAR_SIZE = 32;
const OVERLAP = 10;

/** Six distinct background colors derived from the brand palette for collaborator avatars. */
const COLLABORATOR_COLORS = [
  '#278EA5', // ocean
  '#A9D6C7', // seafoam
  '#123047', // navy
  '#F4E9D8', // sand
  '#23775D', // success green
  '#A3620F', // warning amber
];

function getCollaboratorColor(userId: string): string {
  const slice = userId.slice(-4);
  const index = parseInt(slice, 16) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[isNaN(index) ? 0 : index];
}

function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function Avatar({ member, index }: { member: TripMember; index: number }) {
  const bg = getCollaboratorColor(member.user_id);
  // Pick text color: dark bg gets white text, light bg gets navy text
  const isDark = ['#278EA5', '#123047', '#23775D'].includes(bg);
  const textColor = isDark ? '#FFFDFC' : '#123047';

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: bg,
          marginLeft: index === 0 ? 0 : -OVERLAP,
          zIndex: index,
        },
      ]}
      accessibilityLabel={`${member.display_name} (${member.role})`}>
      <ThemedText type="small" style={[styles.initials, { color: textColor }]}>
        {getInitials(member.display_name)}
      </ThemedText>
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
