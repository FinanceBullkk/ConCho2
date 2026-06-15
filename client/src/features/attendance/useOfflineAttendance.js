import { useState, useEffect, useCallback, useRef } from 'react';
import { attendanceAPI } from '../../api/api';
import { enqueueMarks, getAllQueued, removeKeys } from './attendance-offline-db';
import { groupBySchedule } from './attendance-offline-utils';

// Drives the offline attendance loop:
//   • tracks online/offline,
//   • queues marks to IndexedDB when offline,
//   • flushes the queue (per-schedule bulkMark) when back online — also
//     triggered by the service worker's Background Sync message.
// The actual POST goes through the shared axios client so CSRF + auth headers
// are applied (a service worker replay would have to re-implement that).

const SYNC_TAG = 'flush-attendance';

const registerBackgroundSync = async () => {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) await reg.sync.register(SYNC_TAG);
  } catch { /* Background Sync unsupported — the online-event flush still covers it */ }
};

export function useOfflineAttendance() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queuedCount, setQueuedCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const rows = await getAllQueued();
    setQueuedCount(rows.length);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return { synced: 0 };
    flushingRef.current = true;
    setFlushing(true);
    let synced = 0;
    try {
      const rows = await getAllQueued();
      for (const group of groupBySchedule(rows)) {
        try {
          await attendanceAPI.bulkMark(group.scheduleId, group.records);
          await removeKeys(group.keys); // only drop what the server accepted
          synced += group.records.length;
        } catch { /* leave this schedule queued; a later flush retries it */ }
      }
    } finally {
      flushingRef.current = false;
      setFlushing(false);
      await refreshCount();
    }
    return { synced };
  }, [refreshCount]);

  // Queue marks locally (offline path) and ask the platform to sync later.
  const enqueue = useCallback(async (scheduleId, records) => {
    await enqueueMarks(scheduleId, records);
    await refreshCount();
    await registerBackgroundSync();
  }, [refreshCount]);

  useEffect(() => {
    // Load the initial queue count via a promise callback (not a synchronous
    // setState in the effect body) so we don't trigger a cascading render.
    let alive = true;
    getAllQueued().then((rows) => { if (alive) setQueuedCount(rows.length); }).catch(() => {});

    const goOnline = () => { setOnline(true); flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // The SW fires Background Sync in its own context, but the CSRF-safe POST
    // lives here — it messages open clients to run the flush.
    const onSwMessage = (e) => { if (e.data?.type === SYNC_TAG) flush(); };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

    if (typeof navigator !== 'undefined' && navigator.onLine) flush();

    return () => {
      alive = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [flush]);

  return { online, queuedCount, flushing, enqueue, flush };
}
