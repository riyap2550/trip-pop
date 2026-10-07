import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

import { api, type ItineraryEvent } from '@/lib/api';
import { emitDataChanged } from '@/lib/data-events';

export function useTripSync(tripId: string): void {
  const lastSeenAt = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(async () => {
        try {
          const events: ItineraryEvent[] = await api.tripEvents(tripId);
          if (!events.length) return;
          const newestAt = events[0].at;
          if (lastSeenAt.current && newestAt > lastSeenAt.current) {
            emitDataChanged();
          }
          lastSeenAt.current = newestAt;
        } catch {
          // ignore
        }
      }, 5000);
      return () => clearInterval(interval);
    }, [tripId]),
  );
}
