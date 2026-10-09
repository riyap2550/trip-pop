import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, formatDate, Screen } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { api, photoImageSource } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

/** One trip photo, full size. Whoever added it, or the trip's owner, can delete it here. */
export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { accessToken } = useAuth();
  const { data: photo, error } = useApi(() => api.photo(id));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!photo) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const confirmDelete = () =>
    Alert.alert('Delete this photo?', 'It’s removed from the trip for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setDeleteError(null);
          try {
            await api.deletePhoto(photo.id);
            emitDataChanged();
            router.back();
          } catch (e) {
            setDeleteError((e as Error).message);
            setDeleting(false);
          }
        },
      },
    ]);

  return (
    <Screen>
      <Image
        source={photoImageSource(photo.id, accessToken)}
        contentFit="contain"
        transition={150}
        accessibilityLabel={photo.caption || `Photo by ${photo.uploader.display_name}`}
        style={[
          styles.image,
          { aspectRatio: photo.width && photo.height ? photo.width / photo.height : 1, backgroundColor: theme.backgroundSelected },
        ]}
      />
      {!!photo.caption && <ThemedText>{photo.caption}</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        Added by {photo.uploader.display_name || 'a traveler'} · {formatDate(photo.created_at)}
      </ThemedText>
      <ErrorText message={deleteError} />
      {photo.can_delete && <Button title="Delete photo" variant="danger" loading={deleting} onPress={confirmDelete} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', borderRadius: 16 },
});
