import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ToolCallStatus } from '@/components/tool-call-status';
import { Card, Chip, ErrorText, Input } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useApi, useJob } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { api, type ChatMessage } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

const SUGGESTIONS = [
  "It's raining today",
  "I'm tired, slow the day down",
  'Make this trip cheaper',
  'Add something fun for the evening',
  'Swap one of the restaurants',
];

export default function ChatScreen() {
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const theme = useTheme();
  const { data: trip, error: loadError, reload } = useApi(() => api.trip(id));
  const [input, setInput] = useState(prefill ?? '');
  const [pending, setPending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const job = useJob(async () => {
    await reload();
    setPending(null);
    emitDataChanged(); // the itinerary, costs, and dates behind this sheet may all have changed
  });

  const messages: ChatMessage[] = trip?.chat ?? [];
  const last = messages[messages.length - 1];
  // Show the just-sent message right away, until the server's copy of the chat includes it.
  const showPending = pending !== null && !(last?.role === 'user' && last.text === pending);
  const over = trip ? trip.status === 'completed' || trip.status === 'awaiting_feedback' : false;
  const canSend = !!input.trim() && !job.running && !over;

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || job.running || over) return;
    setInput('');
    setPending(message);
    const localTime = new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    await job.start(() => api.chat(id, message, localTime));
    await reload(); // the server saved the message before it started working
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <ErrorText message={loadError} />

        {messages.length === 0 && !showPending && (
          <Card>
            <ThemedText type="heading">What would you like to change?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Swap something you don&apos;t like, move your dates, cut costs, or tell me what&apos;s happening on the trip.
              I&apos;ll update your itinerary.
            </ThemedText>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} disabled={job.running || over} />
              ))}
            </View>
          </Card>
        )}

        {messages.map((m) => (
          <Bubble key={m.at + m.role} role={m.role} text={m.text} />
        ))}
        {showPending && <Bubble role="user" text={pending} />}

        {job.job && job.running && <ToolCallStatus job={job.job} title="TripPop is working" />}
        <ErrorText message={job.error} />
        {over && (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            This trip is over, so it can&apos;t be changed.
          </ThemedText>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.inputBar, { borderColor: theme.border }]}>
        <Input
          value={input}
          onChangeText={setInput}
          placeholder={over ? 'This trip is over' : 'Ask for a change…'}
          multiline
          editable={!job.running && !over}
          style={styles.input}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.send, { backgroundColor: theme.tint, opacity: canSend ? 1 : 0.35 }]}>
          <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward' }} tintColor={theme.tintText} size={18} />
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, text }: { role: ChatMessage['role']; text: string }) {
  const theme = useTheme();
  const mine = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        { backgroundColor: mine ? theme.tint : theme.backgroundElement, boxShadow: mine ? undefined : `0 1px 8px ${theme.shadow}` },
      ]}>
      <ThemedText style={{ color: mine ? theme.tintText : theme.text }}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  messages: { padding: Spacing.three, gap: Spacing.two + 2, flexGrow: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bubble: { maxWidth: '85%', borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 120, minHeight: 44 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
