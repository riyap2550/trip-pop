import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAgentActivity } from '@/hooks/agent-activity';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { pendingApprovals, openDocuments } = useAgentActivity();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      tintColor={colors.tint}
      labelStyle={{ selected: { color: colors.tint } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="trips">
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="deals">
        <NativeTabs.Trigger.Label>Deals</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tag" md="sell" />
        {pendingApprovals > 0 && <NativeTabs.Trigger.Badge>{String(pendingApprovals)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="docs">
        <NativeTabs.Trigger.Label>Docs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="doc.text" md="description" />
        {openDocuments > 0 && <NativeTabs.Trigger.Badge>{String(openDocuments)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
