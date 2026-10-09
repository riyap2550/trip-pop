import { Stack } from 'expo-router';

import { largeTitleScreenOptions } from '@/constants/navigation';

export const unstable_settings = {
  // Keep the Social home beneath a profile or shared trip opened from elsewhere, so Back leads to it.
  anchor: 'index',
};

export default function SocialLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Social' }} />
      <Stack.Screen name="user/[id]" options={{ title: 'Profile', headerLargeTitle: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: 'Trip', headerLargeTitle: false }} />
    </Stack>
  );
}
