import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, type Trip } from '@/lib/api';
import { onDataChanged } from '@/lib/data-events';
import { notifyDealAlerts, registerExpoPushToken, syncDocumentReminders } from '@/lib/notifications';
import { useAuth } from '@/hooks/use-auth';

type Activity = {
  pendingApprovals: number;
  openDocuments: number;
  /** Finished trips waiting for a rating that haven't been snoozed, oldest first. */
  feedbackDue: Trip[];
  /** Show the feedback prompt for this trip right away (e.g. just ended), ahead of any others. */
  promptFeedback: (trip: Trip) => void;
  /** Stop prompting for this trip this session (rated or "Maybe later"). */
  dismissFeedback: (tripId: string) => void;
  refresh: () => void;
};

const AgentActivityContext = createContext<Activity>({
  pendingApprovals: 0,
  openDocuments: 0,
  feedbackDue: [],
  promptFeedback: () => {},
  dismissFeedback: () => {},
  refresh: () => {},
});

const POLL_MS = 30_000;

/**
 * Keeps the app in sync with the agent's background work while it's open:
 * surfaces new deal alerts as notifications, schedules document reminders,
 * feeds tab badges, and finds finished trips to ask about.
 */
export function AgentActivityProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isAuthenticated = auth.status === 'authenticated';
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [openDocuments, setOpenDocuments] = useState(0);
  const [feedbackDue, setFeedbackDue] = useState<Trip[]>([]);
  // A trip the traveler just ended stays first, so a background sync can't swap the prompt mid-rating.
  const prioritized = useRef<string | null>(null);
  const dismissed = useRef(new Set<string>());
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      // Fetching trips also has the server mark any trip whose dates have passed as finished.
      const [deals, docs, trips] = await Promise.all([api.deals(), api.documents(), api.trips()]);
      setPendingApprovals(deals.holds.filter((h) => h.status === 'pending_approval').length);
      setOpenDocuments(docs.filter((d) => d.action_required && !d.done).length);
      const now = Date.now();
      setFeedbackDue(
        trips
          .filter((t) => t.status === 'awaiting_feedback')
          .filter((t) => !t.feedback_snoozed_until || Date.parse(t.feedback_snoozed_until) <= now)
          .filter((t) => !dismissed.current.has(t.id))
          .sort(
            (a, b) =>
              Number(b.id === prioritized.current) - Number(a.id === prioritized.current) ||
              a.end_date.localeCompare(b.end_date),
          ),
      );
      await notifyDealAlerts(deals.alerts, firstLoad.current);
      await syncDocumentReminders(docs);
      firstLoad.current = false;
    } catch {
      // Backend offline; screens show their own errors.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // refresh() only sets state after its network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Register push token once per authenticated session (best-effort, errors are swallowed)
    registerExpoPushToken().catch(() => {});
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isAuthenticated, refresh]);

  // Trips changed (edited or chatted about): prices, holds, and documents may have changed too.
  useEffect(() => onDataChanged(() => void refresh()), [refresh]);

  const promptFeedback = useCallback((trip: Trip) => {
    dismissed.current.delete(trip.id);
    prioritized.current = trip.id;
    setFeedbackDue((due) => [trip, ...due.filter((t) => t.id !== trip.id)]);
  }, []);

  const dismissFeedback = useCallback((tripId: string) => {
    dismissed.current.add(tripId);
    if (prioritized.current === tripId) prioritized.current = null;
    setFeedbackDue((due) => due.filter((t) => t.id !== tripId));
  }, []);

  // Tapping a notification opens the relevant tab.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.navigate(url as Href);
    });
    return () => sub.remove();
  }, []);

  return (
    <AgentActivityContext.Provider
      value={{
        pendingApprovals: isAuthenticated ? pendingApprovals : 0,
        openDocuments: isAuthenticated ? openDocuments : 0,
        feedbackDue: isAuthenticated ? feedbackDue : [],
        promptFeedback,
        dismissFeedback,
        refresh,
      }}
    >
      {children}
    </AgentActivityContext.Provider>
  );
}

export const useAgentActivity = () => useContext(AgentActivityContext);
