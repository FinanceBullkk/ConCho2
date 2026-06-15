import { buildQueueRows } from './attendance-offline-utils';

// Minimal promise-based IndexedDB wrapper for the offline attendance queue.
// One object store keyed by (schedule, user) so a re-mark overwrites the
// previous one (last-write-wins, matching the server upsert). No external
// dependency — `idb` would be overkill for one tiny store.

const DB_NAME = 'tms-offline';
const DB_VERSION = 1;
const STORE = 'attendance-queue';

const hasIDB = () => typeof indexedDB !== 'undefined';

const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async (mode, run) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    Promise.resolve(run(store)).then((r) => { result = r; }).catch(reject);
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

// Queue (or overwrite) marks for one schedule. Returns the rows written.
export const enqueueMarks = async (scheduleId, records, queuedAt = Date.now()) => {
  if (!hasIDB()) return [];
  const rows = buildQueueRows(scheduleId, records, queuedAt);
  await tx('readwrite', (store) => { rows.forEach((row) => store.put(row)); });
  return rows;
};

export const getAllQueued = async () => {
  if (!hasIDB()) return [];
  return tx('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
};

export const removeKeys = async (keys) => {
  if (!hasIDB() || !keys.length) return;
  await tx('readwrite', (store) => { keys.forEach((k) => store.delete(k)); });
};

export const countQueued = async () => (await getAllQueued()).length;
