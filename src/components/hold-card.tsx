import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { openBooking } from '@/components/booking-link';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, money, Pill } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type Hold } from '@/lib/api';

const STATUS = {
  pending_approval: 'Needs your approval',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
} as const;

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expiring';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.ceil(ms / 60_000)}m left`;
}

/** A held deal or a prepared reservation change. Nothing is final until the traveler approves. */
export function HoldCard({ hold, onChange }: { hold: Hold; onChange: (hold: Hold) => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = hold.status === 'pending_approval';

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'decline');
    setError(null);
    try {
      const updated = await (approve ? api.approveHold(hold.id) : api.declineHold(hold.id));
      onChange(updated);
      // Approving a flight or hotel hold continues to the partner site to finish checkout.
      if (approve && hold.kind !== 'change') await openBooking(hold.booking_url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const priceLabel =
    hold.kind === 'change'
      ? hold.price === 0
        ? 'No cost change'
        : `${hold.price > 0 ? '+' : '−'}${money(Math.abs(hold.price))}`
      : `${money(hold.price)} total`;

  return (
    <Card style={pending ? { borderWidth: 1, borderColor: theme.warning } : undefined}>
      <View style={styles.row}>
        <Pill
          label={pending ? `${STATUS[hold.status]} · ${timeLeft(hold.expires_at)}` : STATUS[hold.status]}
          color={pending ? theme.warning : hold.status === 'approved' ? theme.success : undefined}
        />
      </View>
      <ThemedText type="smallBold">{hold.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {hold.details}
      </ThemedText>
      {hold.reason && <ThemedText type="small">{hold.reason}</ThemedText>}
      <ThemedText type="smallBold">{priceLabel}</ThemedText>
      {pending && (
        <View style={styles.row}>
          <Button
            title={hold.kind === 'change' ? 'Approve change' : 'Approve & book'}
            onPress={() => decide(true)}
            loading={busy === 'approve'}
            disabled={!!busy}
          />
          <Button
            title="Decline"
            variant="secondary"
            onPress={() => decide(false)}
            loading={busy === 'decline'}
            disabled={!!busy}
          />
        </View>
      )}
      <ErrorText message={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
});
