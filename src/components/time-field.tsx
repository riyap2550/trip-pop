import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/calendar';

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** A time of day as "HH:MM" (24-hour), picked with the platform's own time picker. */
export function TimeField({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const date = toDate(value);
  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type === 'set' && picked) onChange(`${pad(picked.getHours())}:${pad(picked.getMinutes())}`);
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <DateTimePicker
          value={date}
          mode="time"
          display="compact"
          onChange={handle}
          accentColor={theme.accent}
          themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Time, ${formatTime(value)}. Tap to change.`}
      onPress={() => DateTimePickerAndroid.open({ value: date, mode: 'time', is24Hour: false, onChange: handle })}
      style={[styles.androidButton, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText>{formatTime(value)}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-start' },
  androidButton: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
