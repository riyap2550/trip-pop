import { Stack } from 'expo-router';

import { largeTitleScreenOptions } from '@/constants/navigation';

export const unstable_settings = {
  // Keep the trip list beneath a trip opened from a link, notification, or another tab,
  // so Back always leads to it.
  anchor: 'index',
};

export default function TripsLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Trips' }} />
      <Stack.Screen name="[id]" options={{ title: 'Trip', headerLargeTitle: false }} />
    </Stack>
  );
}
