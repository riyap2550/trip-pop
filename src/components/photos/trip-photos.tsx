import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PhotoThumb } from '@/components/photos/photo-thumb';
import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type Photo } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

const THUMB = 96;

/**
 * A trip's photos in one horizontal strip: a single dump spot rather than a section per day. Pass `photos`
 * when the screen already has them (the shared trip view); otherwise they're loaded here. With `canUpload`,
 * the strip starts with an Add tile. The server still files each photo under a trip day, so uploads use the first.
 */
export function TripPhotos({
  tripId,
  days,
  photos,
  canUpload,
}: {
  tripId: string;
  days: { date: string }[];
  photos?: Photo[];
  canUpload: boolean;
}) {
  const { data, error, reload } = useApi(() => (photos ? Promise.resolve(photos) : api.tripPhotos(tripId)));
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const list = photos ?? data ?? [];
  const uploadDate = days[0]?.date;

  const addPhotos = async () => {
    if (!uploadDate) return;
    setUploadError(null);
    // No permission request needed: the system picker only hands over what the user selects.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      // Below 1 the picker re-encodes, which also turns HEIC into JPEG the server accepts
      quality: 0.8,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const assets = result.assets;
    try {
      // One at a time, so a slow connection isn't swamped and progress reads naturally
      for (const [i, asset] of assets.entries()) {
        setProgress(`Uploading ${i + 1} of ${assets.length}…`);
        await api.uploadPhoto(tripId, uploadDate, asset);
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setProgress(null);
      reload();
      emitDataChanged();
    }
  };

  if (!list.length && !canUpload && !error) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          No photos yet.
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <ErrorText message={error ?? uploadError} />
      {!!progress && (
        <ThemedText type="small" themeColor="textSecondary">
          {progress}
        </ThemedText>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {canUpload && <AddTile disabled={!!progress || !uploadDate} onPress={addPhotos} />}
        {list.map((photo) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            size={THUMB}
            onPress={() => router.push({ pathname: '/photo/[id]', params: { id: photo.id } })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function AddTile({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Add photos"
      style={({ pressed }) => [
        styles.add,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="subtitle" themeColor="textSecondary">
        +
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Add
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  strip: { gap: Spacing.two },
  add: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
