import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { BookingLink } from '@/components/booking-link';
import { HoldCard } from '@/components/hold-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, ErrorText, money, Screen, SectionTitle } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type Watch } from '@/lib/api';

function trend(watch: Watch) {
  const prices = watch.history.map((h) => h.price);
  const current = prices.at(-1) ?? 0;
  const low = Math.min(...prices);
  const first = prices[0] ?? current;
  const change = first ? Math.round(((current - first) / first) * 100) : 0;
  return { current, low, change };
}

export default function DealsScreen() {
  const theme = useTheme();
  const { refresh: refreshActivity } = useAgentActivity();
  const { data, error, refreshing, refresh, setData } = useApi(api.deals, 20_000);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const checkNow = async () => {
    setChecking(true);
    try {
      const { alerts_created } = await api.runWatcher();
      setCheckResult(alerts_created ? `Found ${alerts_created} new deal${alerts_created > 1 ? 's' : ''}.` : 'No deals worth alerting yet.');
      await refresh();
      refreshActivity();
    } catch (e) {
      setCheckResult((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  if (!data) {
    return (
      <Screen>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const pending = data.holds.filter((h) => h.status === 'pending_approval');
  const decided = data.holds.filter((h) => h.status !== 'pending_approval').slice(0, 5);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ThemedText type="small" themeColor="textSecondary">
        I check your flight and hotel prices in the background. When a price hits your target or drops unusually low,
        I place a free hold and ask you before anything is booked.
      </ThemedText>
      <Button title="Check prices now" variant="secondary" onPress={checkNow} loading={checking} />
      {checkResult && <ThemedText type="small">{checkResult}</ThemedText>}

      {pending.length > 0 && <SectionTitle>Waiting for your approval</SectionTitle>}
      {pending.map((hold) => (
        <HoldCard
          key={hold.id}
          hold={hold}
          onChange={(h) => {
            setData({ ...data, holds: data.holds.map((x) => (x.id === h.id ? h : x)) });
            refreshActivity();
          }}
        />
      ))}

      <SectionTitle>Price watches</SectionTitle>
      {data.watches.length === 0 && (
        <EmptyState title="Nothing to watch yet" body="Plan a trip and I'll start watching its prices." />
      )}
      {data.watches.map((watch) => {
        const t = trend(watch);
        return (
          <Card key={watch.id}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">{watch.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {watch.trip_title}
                </ThemedText>
              </View>
              <Switch
                value={watch.active}
                onValueChange={async (active) => {
                  const updated = await api.updateWatch(watch.id, { active });
                  setData({ ...data, watches: data.watches.map((w) => (w.id === watch.id ? { ...w, ...updated, history: w.history } : w)) });
                }}
              />
            </View>
            <View style={styles.stats}>
              <Stat label="Now" value={money(t.current)} />
              <Stat label="Target" value={money(watch.target_price)} />
              <Stat label="Lowest" value={money(t.low)} />
              <Stat
                label="Trend"
                value={`${t.change > 0 ? '▲' : t.change < 0 ? '▼' : '–'} ${Math.abs(t.change)}%`}
                color={t.change < 0 ? theme.success : t.change > 0 ? theme.danger : undefined}
              />
            </View>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {watch.price_unit} · {watch.history.length} checks
              </ThemedText>
              <BookingLink url={watch.booking_url} label="See prices" />
            </View>
          </Card>
        );
      })}

      {data.alerts.length > 0 && <SectionTitle>Recent alerts</SectionTitle>}
      {data.alerts.slice(0, 8).map((alert) => (
        <Card key={alert.id}>
          <ThemedText type="smallBold">{alert.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {alert.body}
          </ThemedText>
        </Card>
      ))}

      {decided.length > 0 && <SectionTitle>Past holds</SectionTitle>}
      {decided.map((hold) => (
        <HoldCard key={hold.id} hold={hold} onChange={() => {}} />
      ))}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={color ? { color } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.two },
});
