import { Stack } from 'expo-router';

import { largeTitleScreenOptions } from '@/constants/navigation';

export default function CalendarLayout() {
  return (
    <Stack screenOptions={largeTitleScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Calendar' }} />
    </Stack>
  );
}
