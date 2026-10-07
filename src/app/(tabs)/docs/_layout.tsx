import { Stack } from 'expo-router';

import { largeTitleScreenOptions } from '@/constants/navigation';

export default function DocumentsLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Documents' }} />
    </Stack>
  );
}
