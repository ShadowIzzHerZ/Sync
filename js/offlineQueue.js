// ---------------------------------------------------------------------------
// Offline report queue: when a submission can't reach the network, the
// whole thing (photo included, as a Blob) is stashed in IndexedDB instead
// of being lost. It's flushed automatically on load and whenever the
// browser fires `online`. This is deliberately not the Background Sync API
// (SyncManager) — that's Chromium-only and won't run on Safari/iOS, and a
// civic-issue reporter used on a phone needs to work there too. Flushing on
// `online` + on app open is less magical but portable.
// ---------------------------------------------------------------------------
import { uploadReportPhoto, createReport } from "./api.js";

const DB_NAME = "zen-offline";
const DB_VERSION = 1;
const STORE = "pending-reports";

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const result = await fn(tx.objectStore(STORE));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return result;
}

/** @param {object} record - everything createReport()/uploadReportPhoto() need, plus a Blob photo. */
export async function queuePendingReport(record) {
  const id = crypto.randomUUID();
  await withStore("readwrite", (store) => requestToPromise(store.put({ ...record, id, queuedAt: Date.now() })));
  notifyListeners();
  return id;
}

export async function getPendingReports() {
  return withStore("readonly", (store) => requestToPromise(store.getAll()));
}

async function removePendingReport(id) {
  await withStore("readwrite", (store) => requestToPromise(store.delete(id)));
  notifyListeners();
}

export async function countPendingReports() {
  const all = await getPendingReports();
  return all.length;
}

const listeners = new Set();
export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

let flushing = false;

/** Attempts to submit every queued report, oldest first. Safe to call repeatedly/concurrently. */
export async function flushPendingReports({ onResult } = {}) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const pending = await getPendingReports();
    for (const item of pending.sort((a, b) => a.queuedAt - b.queuedAt)) {
      try {
        const photoUrl = await uploadReportPhoto(item.reporterId, item.photoBlob);
        const { ticket, merged } = await createReport({ ...item, photoUrl });
        await removePendingReport(item.id);
        onResult?.({ ok: true, item, ticket, merged });
      } catch (err) {
        // Leave it queued — could still be offline, or a transient error.
        // Stop this pass rather than hammering a failing network for every item.
        onResult?.({ ok: false, item, error: err });
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

let autoFlushWired = false;
/** Wires up automatic flushing on load + reconnect. Call once at startup. */
export function startAutoFlush(onResult) {
  if (autoFlushWired) return;
  autoFlushWired = true;
  window.addEventListener("online", () => flushPendingReports({ onResult }));
  flushPendingReports({ onResult });
}
