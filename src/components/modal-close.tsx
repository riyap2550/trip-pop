import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/** "Close" for a modal screen's header. */
export function ModalClose({ label = 'Close' }: { label?: string }) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      hitSlop={8}
      accessibilityRole="button">
      <ThemedText type="smallBold" themeColor="tint">
        {label}
      </ThemedText>
    </Pressable>
  );
}
