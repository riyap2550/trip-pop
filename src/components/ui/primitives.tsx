import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={screenContentStyle}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }>
      {children}
    </ScrollView>
  );
}

/** Padding for a screen's scroll content, for screens that need their own scroll view. */
export const screenContentStyle: ViewStyle = {
  padding: Spacing.three,
  gap: Spacing.three,
  paddingBottom: BottomTabInset + Spacing.five,
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, boxShadow: `0 2px 14px ${theme.shadow}` },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = { primary: theme.tint, secondary: theme.backgroundSelected, danger: theme.danger }[variant];
  const fg = variant === 'secondary' ? theme.text : theme.tintText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <ThemedText type="smallBold" style={{ color: fg }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Pill({ label, color }: { label: string; color?: string }) {
  const theme = useTheme();
  const c = color ?? theme.textSecondary;
  return (
    <View style={[styles.pill, { borderColor: c }]}>
      <ThemedText type="small" style={{ color: c, fontSize: 12, lineHeight: 16 }}>
        {label}
      </ThemedText>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.tint : theme.backgroundSelected,
          borderColor: selected ? theme.tint : theme.border,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText type={selected ? 'smallBold' : 'small'} style={{ color: selected ? theme.tintText : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.tint }]}>
            <ThemedText
              type="small"
              style={{ color: selected ? theme.tintText : theme.text, textTransform: labels ? 'none' : 'capitalize' }}>
              {labels?.[option] ?? option}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A − / + control for a small whole number, like the number of travelers. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const theme = useTheme();
  const step = (symbol: string, next: number, a11y: string) => {
    const off = disabled || next < min || next > max;
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={off}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={({ pressed }) => [
          styles.stepButton,
          { backgroundColor: theme.backgroundSelected, opacity: off ? 0.35 : pressed ? 0.7 : 1 },
        ]}>
        <ThemedText type="smallBold">{symbol}</ThemedText>
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper}>
      {step('−', value - 1, `Fewer ${label}`)}
      <ThemedText type="smallBold" style={styles.stepValue} accessibilityLiveRegion="polite">
        {value}
      </ThemedText>
      {step('+', value + 1, `More ${label}`)}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
        props.multiline && { minHeight: 80, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <ThemedText type="small" style={{ color: theme.danger }}>
      {message}
    </ThemedText>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: Spacing.five }}>
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {body}
      </ThemedText>
    </Card>
  );
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function formatDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "Fri, Nov 6 – Sun, Nov 8", or just "Sat, Nov 7" for a day trip. */
export function formatDateRange(start: string, end: string) {
  return start.slice(0, 10) === end.slice(0, 10) ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.three + 2,
    gap: Spacing.two + 2,
  },
  button: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two - 1 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 999 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 12,
    marginTop: Spacing.two,
  },
});
