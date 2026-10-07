import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Job } from '@/lib/api';

/** Shows the agent's steps as it works: finished steps get a check, the current one a spinner. */
export function ToolCallStatus({ job, title }: { job: Job; title: string }) {
  const theme = useTheme();
  const running = job.status === 'running';
  const steps = job.steps.length ? job.steps : ['Thinking about your request'];

  return (
    <Card>
      <ThemedText type="heading">{title}</ThemedText>
      {steps.map((step, i) => {
        const current = running && i === steps.length - 1;
        return (
          <View key={`${step}-${i}`} style={styles.row}>
            {current ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <SymbolView
                name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                tintColor={theme.success}
                size={18}
              />
            )}
            <ThemedText type="small" themeColor={current ? 'text' : 'textSecondary'}>
              {step}
            </ThemedText>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 22 },
});
