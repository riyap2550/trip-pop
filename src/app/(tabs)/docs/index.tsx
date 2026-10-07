import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { BookingLink } from '@/components/booking-link';
import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, ErrorText, formatDate, Pill, Screen, SectionTitle } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type TravelDocument } from '@/lib/api';

function daysUntil(iso: string) {
  return Math.ceil((new Date(`${iso.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86_400_000);
}

export default function DocsScreen() {
  const theme = useTheme();
  const { refresh: refreshActivity } = useAgentActivity();
  const { data: docs, error, refreshing, refresh, setData } = useApi(api.documents, 30_000);

  const toggle = async (doc: TravelDocument) => {
    const updated = await api.updateDocument(doc.id, !doc.done);
    setData((docs ?? []).map((d) => (d.id === doc.id ? { ...d, ...updated } : d)));
    refreshActivity();
  };

  const byTrip = new Map<string, TravelDocument[]>();
  docs?.forEach((d) => byTrip.set(d.trip_title ?? d.trip_id, [...(byTrip.get(d.trip_title ?? d.trip_id) ?? []), d]));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ErrorText message={error} />
      <ThemedText type="small" themeColor="textSecondary">
        I check passport, visa, and entry rules for each trip from official sources, then schedule reminders with
        enough lead time to act.
      </ThemedText>
      {docs?.length === 0 && (
        <EmptyState title="Nothing to track yet" body="Requirements appear here after you plan a trip." />
      )}
      {[...byTrip.entries()].map(([tripTitle, items]) => (
        <View key={tripTitle} style={{ gap: Spacing.two }}>
          <SectionTitle>{tripTitle}</SectionTitle>
          {items.map((doc) => {
            const days = daysUntil(doc.deadline);
            const color = doc.done || !doc.action_required
              ? theme.success
              : doc.urgent || days <= 7
                ? theme.danger
                : days <= 30
                  ? theme.warning
                  : theme.tint;
            return (
              <Card key={doc.id}>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => toggle(doc)}
                    disabled={!doc.action_required}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: doc.done }}>
                    <SymbolView
                      name={
                        doc.done || !doc.action_required
                          ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
                          : { ios: 'circle', android: 'radio_button_unchecked' }
                      }
                      tintColor={color}
                      size={24}
                    />
                  </Pressable>
                  <ThemedText
                    type="smallBold"
                    style={[{ flex: 1 }, doc.done && { textDecorationLine: 'line-through' }]}>
                    {doc.title}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {doc.detail}
                </ThemedText>
                <View style={styles.row}>
                  {doc.action_required ? (
                    <Pill
                      label={
                        doc.done
                          ? 'Done'
                          : days < 0
                            ? `Deadline passed ${formatDate(doc.deadline)}`
                            : `Due ${formatDate(doc.deadline)} · ${days}d`
                      }
                      color={color}
                    />
                  ) : (
                    <Pill label="No action needed" color={theme.success} />
                  )}
                  {doc.action_required && !doc.done && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Reminder {formatDate(doc.remind_at)}
                    </ThemedText>
                  )}
                  <View style={{ flex: 1 }} />
                  <BookingLink url={doc.source_url} label="Source" />
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
