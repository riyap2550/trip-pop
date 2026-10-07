import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Input, Screen, Segmented } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useApi } from '@/hooks/use-api';
import { api, type Profile } from '@/lib/api';

type Draft = {
  name: string;
  home_airport: string;
  passport_country: string;
  passport_expiry: string;
  budget_style: Profile['budget_style'];
  pace: Profile['pace'];
  interests: string;
  dislikes: string;
};

const toDraft = (p: Profile): Draft => ({
  name: p.name,
  home_airport: p.home_airport,
  passport_country: p.passport_country,
  passport_expiry: p.passport_expiry ?? '',
  budget_style: p.budget_style,
  pace: p.pace,
  interests: p.interests.join(', '),
  dislikes: p.dislikes.join(', '),
});

const splitList = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export default function ProfileScreen() {
  const auth = useAuth();
  const { data: profile, error, refreshing, refresh, setData } = useApi(api.profile);
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const draft = edits ?? (profile ? toDraft(profile) : null);

  if (!profile || !draft) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const set = (patch: Partial<Draft>) => {
    setEdits({ ...draft, ...patch });
    setSaved(false);
  };

  const save = async () => {
    const expiry = draft.passport_expiry.trim();
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      setSaveError('Enter the passport expiry as YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      setData(
        await api.updateProfile({
          name: draft.name.trim(),
          home_airport: draft.home_airport.trim(),
          passport_country: draft.passport_country.trim(),
          passport_expiry: expiry || null,
          budget_style: draft.budget_style,
          pace: draft.pace,
          interests: splitList(draft.interests),
          dislikes: splitList(draft.dislikes),
        }),
      );
      setEdits(null);
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const authUser = auth.status === 'authenticated' ? auth.user : null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {authUser && (
        <Card>
          <View style={profileStyles.userInfo}>
            <ThemedText type="heading">{authUser.display_name || authUser.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {authUser.email}
            </ThemedText>
          </View>
          <Button
            title={signingOut ? '...' : 'Sign out'}
            variant="secondary"
            onPress={handleSignOut}
            loading={signingOut}
          />
        </Card>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Every plan starts from this profile, so you never have to repeat yourself. I update it after each trip based on
        your feedback.
      </ThemedText>

      <Card>
        <Field label="Name">
          <Input value={draft.name} onChangeText={(name) => set({ name })} placeholder="Your name" />
        </Field>
        <Field label="Home airport">
          <Input
            value={draft.home_airport}
            onChangeText={(home_airport) => set({ home_airport })}
            autoCapitalize="characters"
            maxLength={3}
            placeholder="JFK"
          />
        </Field>
        <Field label="Passport country">
          <Input value={draft.passport_country} onChangeText={(passport_country) => set({ passport_country })} />
        </Field>
        <Field label="Passport expiry">
          <Input
            value={draft.passport_expiry}
            onChangeText={(passport_expiry) => set({ passport_expiry })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </Field>
        <Field label="Budget style">
          <Segmented
            options={['value', 'mid', 'luxury'] as const}
            value={draft.budget_style}
            onChange={(budget_style) => set({ budget_style })}
          />
        </Field>
        <Field label="Pace">
          <Segmented
            options={['relaxed', 'balanced', 'packed'] as const}
            value={draft.pace}
            onChange={(pace) => set({ pace })}
          />
        </Field>
        <Field label="Interests (comma separated)">
          <Input value={draft.interests} onChangeText={(interests) => set({ interests })} placeholder="beach, food, history" />
        </Field>
        <Field label="Dislikes">
          <Input value={draft.dislikes} onChangeText={(dislikes) => set({ dislikes })} placeholder="red-eye flights, crowds" />
        </Field>
        <Button title={saved ? 'Saved' : 'Save profile'} onPress={save} loading={saving} disabled={saved} />
        <ErrorText message={saveError} />
      </Card>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={profileStyles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const profileStyles = StyleSheet.create({
  userInfo: {
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
});
