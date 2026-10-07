import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { largeTitleScreenOptions } from '@/constants/navigation';

export default function TripsLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Trips',
          // Transparent on iOS so the header takes on the list's scroll-driven background color.
          ...(Platform.OS === 'ios' && { headerTransparent: true, headerBlurEffect: 'systemMaterial' as const }),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Trip', headerLargeTitle: false }} />
    </Stack>
  );
}
