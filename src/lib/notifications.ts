import * as Notifications from 'expo-notifications';

import type { Alert, TravelDocument } from '@/lib/api';

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
