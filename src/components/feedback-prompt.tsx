import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAgentActivity } from '@/hooks/agent-activity';
import { api } from '@/lib/api';

/**
 * Opens the feedback sheet (app/feedback/[id]) as soon as a trip is over, one trip at a time.
 * Renders nothing itself. The sheet is a navigation modal rather than a <Modal> overlay so that
 * iOS sheet gestures can't leave the app thinking an overlay is still open.
 *
 * Leaving the sheet without rating (Maybe later, swipe down) snoozes that trip for a day.
 */
export function FeedbackPrompt() {
  const pathname = usePathname();
  const { feedbackDue, dismissFeedback } = useAgentActivity();
  const presented = useRef<string | null>(null);
  const onFeedbackSheet = pathname.startsWith('/feedback/');

  useEffect(() => {
    if (onFeedbackSheet) return;

    if (presented.current) {
      // The sheet just closed. If it wasn't rated, the trip is still due: treat it as "Maybe later".
      const id = presented.current;
      presented.current = null;
      if (feedbackDue.some((t) => t.id === id)) {
        dismissFeedback(id);
        api.snoozeFeedback(id).catch(() => {
          // Offline: it stays dismissed for this session and comes back next launch.
        });
      }
      return;
    }

    const next = feedbackDue[0];
    if (next) {
      presented.current = next.id;
      router.push(`/feedback/${next.id}`);
    }
  }, [onFeedbackSheet, feedbackDue, dismissFeedback]);

  return null;
}
