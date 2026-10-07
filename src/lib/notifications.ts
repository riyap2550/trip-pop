import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Alert, TravelDocument } from '@/lib/api';
import { api } from '@/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permission: Promise<boolean> | null = null;

function ensurePermission() {
  permission ??= Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  }).then(({ status }) => status === 'granted');
  return permission;
}

/** Schedule a local reminder for each open document task (skipping ones already scheduled). */
export async function syncDocumentReminders(docs: TravelDocument[]) {
  if (!(await ensurePermission())) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const byDoc = new Map(scheduled.map((n) => [n.content.data?.documentId as string | undefined, n.identifier]));

  for (const doc of docs) {
    const existing = byDoc.get(doc.id);
    const wanted = doc.action_required && !doc.done;
    if (!wanted) {
      if (existing) await Notifications.cancelScheduledNotificationAsync(existing);
      continue;
    }
    if (existing) continue;
    const date = new Date(doc.remind_at);
    if (date.getTime() < Date.now()) date.setTime(Date.now() + 60_000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Travel prep: ${doc.title}`,
        body: `${doc.detail} Deadline: ${doc.deadline}.`,
        data: { documentId: doc.id, url: '/docs' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
}

const notifiedAlerts = new Set<string>();

/**
 * Request push notification permission, get the Expo push token, and register it with the backend.
 * Safe to call on every authenticated session start — exits early if no permission or no real device.
 */
export async function registerExpoPushToken(): Promise<void> {
  // expo-device is not in the dependency list; use Platform.OS !== 'web' as the device check
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await api.registerPushToken(tokenData.data, Platform.OS);
  } catch {
    // Swallow errors — push token registration is best-effort
  }
}

/** Show a notification for each deal alert we haven't shown yet in this session. */
export async function notifyDealAlerts(alerts: Alert[], initial: boolean) {
  const fresh = alerts.filter((a) => !a.read && !notifiedAlerts.has(a.id));
  fresh.forEach((a) => notifiedAlerts.add(a.id));
  // On first load, just remember existing alerts instead of replaying them all.
  if (initial || fresh.length === 0 || !(await ensurePermission())) return;
  for (const alert of fresh) {
    await Notifications.scheduleNotificationAsync({
      content: { title: alert.title, body: alert.body, data: { url: '/deals' } },
      trigger: null,
    });
  }
}
