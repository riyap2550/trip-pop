import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function openBooking(url: string) {
  return openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
}

/** Outbound link to a partner booking site (affiliate IDs are added by the backend). */
export function BookingLink({ url, label = 'Book' }: { url: string | null; label?: string }) {
  if (!url) return null;
  return (
    <Pressable onPress={() => openBooking(url)} hitSlop={8} accessibilityRole="link">
      {({ pressed }) => (
        <ThemedText type="linkPrimary" style={{ opacity: pressed ? 0.6 : 1, lineHeight: 20 }}>
          {label} ↗
        </ThemedText>
      )}
    </Pressable>
  );
}
