import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Profile',
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
              <ThemedText type="smallBold" themeColor="tint">
                Done
              </ThemedText>
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
