import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateRangeCalendar } from '@/components/date-range-calendar';
import { UserAvatar } from '@/components/social/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { ToolCallStatus } from '@/components/tool-call-status';
import { Button, Card, Chip, ErrorText, formatDate, Input, Screen, Segmented, Stepper } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';
import { useApi, useJob } from '@/hooks/use-api';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';
import { nightsBetween } from '@/lib/dates';
import {
  BUDGETS,
  buildGoal,
  DURATIONS,
  EMPTY_FILTERS,
  filtersProblem,
  hasAnyFilter,
  TRIP_TYPES,
  upcomingMonths,
  VIBES,
  type PlanFilters,
} from '@/lib/plan-filters';

const MAX_TRAVELERS = 12;

export default function PlanScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const me = auth.status === 'authenticated' && auth.user.avatar_url ? auth.user : null;
  const [filters, setFilters] = useState<PlanFilters>(EMPTY_FILTERS);
  const [problem, setProblem] = useState<string | null>(null);
  const { refresh: refreshActivity } = useAgentActivity();
  const profile = useApi(api.profile);
  const planJob = useJob(() => {
    emitDataChanged(); // notify trips screen to reload the trips list
    setTimeout(refreshActivity, 5_000);
  });
  const locked = planJob.running;
  const months = upcomingMonths();

  const update = (patch: Partial<PlanFilters>) => {
    setProblem(null);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const toggleVibe = (vibe: string) =>
    update({ vibes: filters.vibes.includes(vibe) ? filters.vibes.filter((v) => v !== vibe) : [...filters.vibes, vibe] });
  const pickTripType = (label: string, travelers: number | null) => {
    if (filters.tripType === label) return update({ tripType: null });
    update({ tripType: label, ...(travelers ? { travelers } : {}) });
  };

  const plan = () => {
    const issue = filtersProblem(filters);
    if (issue) return setProblem(issue);
    planJob.start(() => api.plan(buildGoal(filters)));
  };

  const p = profile.data;
  const profileLine = p
    ? [`${p.budget_style} budget`, `${p.pace} pace`, `from ${p.home_airport}`, ...p.interests.slice(0, 3)].join(' · ')
    : null;
  const { start, end } = filters.range;
  const nights = start && end ? nightsBetween(start, end) : null;
  const planned = planJob.job?.status === 'done' ? planJob.job.result : null;

  return (
    <Screen>
      <SafeAreaView edges={['top']}>
        <View style={[styles.hero, { backgroundColor: theme.hero }]}>
          <View style={[styles.sun, { backgroundColor: theme.accent }]} />
          <View style={[styles.sunGlow, { backgroundColor: theme.heroMuted }]} />
          <View style={styles.titleRow}>
            <ThemedText type="accent" style={[styles.brand, { color: theme.heroMuted }]}>
              TripPop
            </ThemedText>
            <Link href="/profile" asChild>
              <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Your travel profile">
                {({ pressed }) =>
                  me ? (
                    <View style={{ opacity: pressed ? 0.6 : 1 }}>
                      <UserAvatar
                        userId={me.id}
                        name={me.display_name || me.email}
                        avatarUrl={me.avatar_url}
                        size={36}
                      />
                    </View>
                  ) : (
                    <SymbolView
                      name={{ ios: 'person.crop.circle', android: 'account_circle' }}
                      tintColor={theme.heroText}
                      size={30}
                      style={{ opacity: pressed ? 0.6 : 1 }}
                    />
                  )
                }
              </Pressable>
            </Link>
          </View>
          <ThemedText type="subtitle" style={[styles.heroTitle, { color: theme.heroText }]}>
            Where to next?
          </ThemedText>
          <ThemedText style={{ color: theme.heroMuted }}>
            Pick as much or as little as you like. I&apos;ll fill in the rest, compare real prices, and build the
            itinerary.
          </ThemedText>
        </View>
      </SafeAreaView>

      <Section title="Where" icon={{ ios: 'mappin.and.ellipse', android: 'location_on' }}>
        <Input
          value={filters.destination}
          onChangeText={(destination) => update({ destination })}
          placeholder="Anywhere, or type a city (e.g. Tulum)"
          autoCapitalize="words"
          returnKeyType="done"
          editable={!locked}
        />
      </Section>

      <Section title="What kind of trip" icon={{ ios: 'person.2', android: 'group' }}>
        <View style={styles.chips}>
          {TRIP_TYPES.map((t) => (
            <Chip
              key={t.label}
              label={t.label}
              selected={filters.tripType === t.label}
              onPress={() => pickTripType(t.label, t.travelers)}
              disabled={locked}
            />
          ))}
        </View>
        <View style={styles.stepperRow}>
          <ThemedText style={{ flex: 1 }}>Travelers</ThemedText>
          <Stepper
            value={filters.travelers}
            label="travelers"
            min={1}
            max={MAX_TRAVELERS}
            onChange={(travelers) => update({ travelers })}
            disabled={locked}
          />
        </View>
      </Section>

      <Section title="Budget" icon={{ ios: 'dollarsign.circle', android: 'payments' }}>
        {filters.travelers > 1 && (
          <Segmented
            options={['person', 'total'] as const}
            labels={{ person: 'Per person', total: 'Total for group' }}
            value={filters.budgetBasis}
            onChange={(budgetBasis) => update({ budgetBasis })}
          />
        )}
        <View style={styles.chips}>
          {BUDGETS.map((b) => (
            <Chip
              key={b.id}
              label={b.label}
              selected={filters.budget === b.id}
              onPress={() => update({ budget: filters.budget === b.id ? null : b.id })}
              disabled={locked}
            />
          ))}
        </View>
        {filters.budget === 'custom' && (
          <Input
            value={filters.customBudget}
            onChangeText={(customBudget) => update({ customBudget })}
            placeholder={filters.budgetBasis === 'total' || filters.travelers === 1 ? 'Total, e.g. 1500' : 'Per person, e.g. 1500'}
            keyboardType="number-pad"
            editable={!locked}
          />
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Covers travel, food, activities, and a hotel if you stay over.
        </ThemedText>
      </Section>

      <Section title="When" icon={{ ios: 'calendar', android: 'calendar_month' }}>
        <Segmented
          options={['flexible', 'exact'] as const}
          labels={{ flexible: "I'm flexible", exact: 'Exact dates' }}
          value={filters.dateMode}
          onChange={(dateMode) => update({ dateMode })}
        />
        {filters.dateMode === 'flexible' ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Month
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChips}>
              {months.map((m) => (
                <Chip
                  key={m.id}
                  label={m.label}
                  selected={filters.month === m.id}
                  onPress={() => update({ month: filters.month === m.id ? null : m.id })}
                  disabled={locked}
                />
              ))}
            </ScrollView>
            <ThemedText type="small" themeColor="textSecondary">
              How long
            </ThemedText>
            <View style={styles.chips}>
              {DURATIONS.map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  selected={filters.duration === d.id}
                  onPress={() => update({ duration: filters.duration === d.id ? null : d.id })}
                  disabled={locked}
                />
              ))}
            </View>
            {filters.duration === 'day' && (
              <ThemedText type="small" themeColor="textSecondary">
                Out and back the same day, so no hotel. I&apos;ll pick somewhere close enough to enjoy.
              </ThemedText>
            )}
          </>
        ) : (
          <>
            <DateRangeCalendar value={filters.range} onChange={(range) => update({ range })} disabled={locked} />
            <ThemedText type="small" themeColor={start && end ? 'text' : 'textSecondary'}>
              {start && end
                ? nights === 0
                  ? `${formatDate(start)} · Day trip, back home the same day`
                  : `${formatDate(start)} → ${formatDate(end)} · ${nights} night${nights === 1 ? '' : 's'}`
                : start
                  ? `${formatDate(start)} → tap your last day, or`
                  : 'Tap your first day, then your last.'}
            </ThemedText>
            {start && !end && (
              <View style={styles.chips}>
                <Chip label="Just this day (day trip)" onPress={() => update({ range: { start, end: start } })} disabled={locked} />
              </View>
            )}
          </>
        )}
      </Section>

      <Section title="Vibe" icon={{ ios: 'sparkles', android: 'auto_awesome' }}>
        <View style={styles.chips}>
          {VIBES.map((v) => (
            <Chip
              key={v.label}
              label={`${v.emoji} ${v.label}`}
              selected={filters.vibes.includes(v.label)}
              onPress={() => toggleVibe(v.label)}
              disabled={locked}
            />
          ))}
        </View>
      </Section>

      <Section title="Anything else?" icon={{ ios: 'text.bubble', android: 'chat' }}>
        <Input
          value={filters.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder="e.g. one of us is vegetarian, we want a pool, no red-eye flights"
          multiline
          editable={!locked}
        />
      </Section>

      <Card>
        {profileLine && (
          <ThemedText type="small" themeColor="textSecondary">
            Also using your profile: {profileLine}
          </ThemedText>
        )}
        <Button
          title={planJob.running ? 'Planning…' : 'Plan my trip'}
          onPress={plan}
          disabled={!hasAnyFilter(filters)}
          loading={planJob.running}
        />
        {hasAnyFilter(filters) && !locked && (
          <Pressable onPress={() => update(EMPTY_FILTERS)} hitSlop={8} accessibilityRole="button" style={styles.clear}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear all
            </ThemedText>
          </Pressable>
        )}
        <ErrorText message={problem ?? planJob.error} />
      </Card>

      {planJob.job && <ToolCallStatus job={planJob.job} title="TripPop is working" />}

      {planned && (
        <Card>
          <ThemedText type="heading">Your trip is ready</ThemedText>
          <ThemedText>{planned.summary}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            I&apos;m now watching prices for this trip and checking passport and entry requirements.
          </ThemedText>
          <View style={styles.row}>
            <Button
              title="View itinerary"
              onPress={() => router.push(`/trips/${planned.trip_id}`, { withAnchor: true })}
            />
            <Button
              title="Plan another"
              variant="secondary"
              onPress={() => {
                planJob.reset();
                setFilters(EMPTY_FILTERS);
              }}
            />
          </View>
        </Card>
      )}
    </Screen>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ComponentProps<typeof SymbolView>['name'];
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.sectionTitle}>
        <SymbolView name={icon} tintColor={theme.accent} size={20} />
        <ThemedText type="heading">{title}</ThemedText>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.two,
    marginTop: Spacing.two,
    overflow: 'hidden',
  },
  // A low sun over the water, purely decorative.
  sun: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, bottom: -120, opacity: 0.35 },
  sunGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, right: 10, bottom: -70, opacity: 0.25 },
  brand: { fontSize: 28, lineHeight: 34 },
  heroTitle: { fontSize: 32, lineHeight: 38 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  monthChips: { flexDirection: 'row', gap: Spacing.two },
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.one },
  clear: { alignSelf: 'center', paddingVertical: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
});
