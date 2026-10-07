import { Stack } from 'expo-router';

import { largeTitleScreenOptions } from '@/constants/navigation';

export default function DealsLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Deals' }} />
    </Stack>
  );
}
