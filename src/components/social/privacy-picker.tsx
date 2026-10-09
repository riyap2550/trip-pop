import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Segmented } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import type { TripPrivacy } from '@/lib/api';
import { TRIP_PRIVACY } from '@/lib/labels';

const LEVELS = ['private', 'friends', 'public'] as const;

/** Who can see a trip. Read-only (`disabled`) for everyone but the owner. */
export function PrivacyPicker({
  value,
  onChange,
  disabled,
}: {
  value: TripPrivacy;
  onChange: (privacy: TripPrivacy) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.picker, disabled && styles.disabled]} accessibilityState={{ disabled: !!disabled }}>
      <Segmented
        options={LEVELS}
        labels={{ private: TRIP_PRIVACY.private.label, friends: TRIP_PRIVACY.friends.label, public: TRIP_PRIVACY.public.label }}
        value={value}
        onChange={onChange}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {TRIP_PRIVACY[value].description}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: Spacing.two },
  disabled: { opacity: 0.6, pointerEvents: 'none' },
});
