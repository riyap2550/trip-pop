import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { photoImageSource, type Photo } from '@/lib/api';

/** A square, cropped photo. The full file is downloaded (no server thumbnails yet), then cached by photo id. */
export function PhotoThumb({ photo, size, onPress }: { photo: Photo; size: number; onPress?: () => void }) {
  const theme = useTheme();
  const { accessToken } = useAuth();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={photo.caption || `Photo by ${photo.uploader.display_name}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Image
        source={photoImageSource(photo.id, accessToken)}
        contentFit="cover"
        transition={150}
        style={[styles.image, { width: size, height: size, backgroundColor: theme.backgroundSelected }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 12 },
});
