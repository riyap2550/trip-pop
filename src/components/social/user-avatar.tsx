import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getAvatarTextColor, getCollaboratorColor, getInitials } from '@/lib/avatar';

/** A round initials avatar in the user's own color, the same one they have on trip member lists. */
export function UserAvatar({ userId, name, size = 40 }: { userId: string; name: string; size?: number }) {
  const background = getCollaboratorColor(userId);
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}
      accessibilityLabel={name}>
      <ThemedText
        type="smallBold"
        style={{ color: getAvatarTextColor(background), fontSize: size * 0.38, lineHeight: size * 0.48 }}>
        {getInitials(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
