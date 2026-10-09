import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/hooks/use-auth';
import { avatarImageSource } from '@/lib/api';
import { getAvatarTextColor, getCollaboratorColor, getInitials } from '@/lib/avatar';

/**
 * A round avatar: the user's profile picture when they have one, otherwise initials in their own color
 * (the same one they have on trip member lists).
 */
export function UserAvatar({
  userId,
  name,
  avatarUrl,
  size = 40,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const { accessToken } = useAuth();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const background = getCollaboratorColor(userId);
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl && avatarUrl !== failedUrl) {
    return (
      <Image
        source={avatarImageSource(avatarUrl, accessToken)}
        contentFit="cover"
        transition={150}
        onError={() => setFailedUrl(avatarUrl)}
        accessibilityLabel={name}
        style={[shape, { backgroundColor: background }]}
      />
    );
  }

  return (
    <View style={[styles.avatar, shape, { backgroundColor: background }]} accessibilityLabel={name}>
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
