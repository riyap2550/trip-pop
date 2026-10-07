import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_600SemiBold_Italic,
  CormorantGaramond_700Bold,
  useFonts,
} from '@expo-google-fonts/cormorant-garamond';
import { Redirect, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { FeedbackPrompt } from '@/components/feedback-prompt';
import { AnimatedSplashOverlay } from '@/components/splash-overlay';
import { ModalClose } from '@/components/modal-close';
import { NavigationThemes, sheetScreenOptions } from '@/constants/navigation';
import { AgentActivityProvider } from '@/hooks/agent-activity';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

SplashScreen.preventAutoHideAsync();

function InnerLayout() {
  const colorScheme = useColorScheme();
  const auth = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_600SemiBold_Italic,
    CormorantGaramond_700Bold,
  });

  // Keep the native splash up until fonts are ready; the overlay hides it once it lays out.
  // On a load error, carry on with system fonts rather than blocking the app.
  if ((!fontsLoaded && !fontError) || auth.status === 'loading') return null;

  if (auth.status === 'unauthenticated') return <Redirect href="/login" />;

  return (
    <ThemeProvider value={NavigationThemes[colorScheme === 'dark' ? 'dark' : 'light']}>
      <AgentActivityProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="feedback/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="edit-trip/[id]"
            options={{ ...sheetScreenOptions, title: 'Edit trip', headerRight: () => <ModalClose label="Cancel" /> }}
          />
          <Stack.Screen
            name="edit-item/[id]"
            options={{ ...sheetScreenOptions, title: 'Itinerary item', headerRight: () => <ModalClose label="Cancel" /> }}
          />
          <Stack.Screen
            name="chat/[id]"
            options={{ ...sheetScreenOptions, title: 'Chat with TripPop', headerRight: () => <ModalClose label="Done" /> }}
          />
        </Stack>
        <FeedbackPrompt />
        <AnimatedSplashOverlay />
      </AgentActivityProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <InnerLayout />
    </AuthProvider>
  );
}
