import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Input, Segmented } from '@/components/ui/primitives';
import { Colors, DisplayFonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={['top']}>
          <View style={[styles.hero, { backgroundColor: Colors.light.hero }]}>
            <View style={[styles.sun, { backgroundColor: Colors.light.accent }]} />
            <View style={[styles.sunGlow, { backgroundColor: Colors.light.heroMuted }]} />
            <ThemedText type="accent" style={[styles.brandName, { color: Colors.light.heroMuted }]}>
              TripPop
            </ThemedText>
            <ThemedText type="subtitle" style={{ color: Colors.light.heroText }}>
              Your personal travel agent
            </ThemedText>
            <ThemedText style={{ color: Colors.light.heroMuted }}>
              Plan trips, track prices, and get itineraries built just for you.
            </ThemedText>
          </View>
        </SafeAreaView>

        <View style={styles.formContainer}>
          <Segmented
            options={['signin', 'signup'] as const}
            labels={{ signin: 'Sign in', signup: 'Create account' }}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError(null);
            }}
          />

          {mode === 'signup' && (
            <Input
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />
          )}

          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />

          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title={loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={handleSubmit}
            loading={loading}
            disabled={loading || !email || !password || (mode === 'signup' && !displayName)}
          />

          <ErrorText message={error} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  hero: {
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.two,
    marginTop: Spacing.two,
    marginHorizontal: Spacing.three,
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -70,
    bottom: -120,
    opacity: 0.35,
  },
  sunGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    right: 10,
    bottom: -70,
    opacity: 0.25,
  },
  brandName: {
    fontFamily: DisplayFonts.bold,
    fontSize: 38,
  },
  formContainer: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
});
