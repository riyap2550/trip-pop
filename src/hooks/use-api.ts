import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, type Job } from '@/lib/api';
import { onDataChanged } from '@/lib/data-events';

/** Fetch data when the screen is focused, optionally re-polling while it stays focused. */
export function useApi<T>(fetcher: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Reload when something elsewhere in the app edited trips (an editor sheet, the chat).
  useEffect(() => onDataChanged(() => void load()), [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!pollMs) return;
      const timer = setInterval(load, pollMs);
      return () => clearInterval(timer);
    }, [load, pollMs]),
  );

  return { data, error, refreshing, refresh, reload: load, setData };
}

/** Start an agent job and poll it until it finishes. */
export function useJob(onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const jobId = job?.id;
  const running = job?.status === 'running';

  useEffect(() => {
    if (!jobId || !running) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.job(jobId);
        setJob(next);
        if (next.status === 'done') onDoneRef.current?.(next);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, running]);

  const start = useCallback(async (begin: () => Promise<Job>) => {
    setError(null);
    try {
      setJob(await begin());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const reset = useCallback(() => {
    setJob(null);
    setError(null);
  }, []);

  return { job, running, error: error ?? job?.error ?? null, start, reset };
}
