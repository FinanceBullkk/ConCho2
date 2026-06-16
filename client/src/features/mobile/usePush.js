import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { meAPI } from '../../api/api';

// ──────────────────────────────────────────────────────────
// usePush — B5 Web Push subscription (mobile learning surface, Horizon 2).
// Registers the SW on demand (it's prod-only in main.jsx so this also enables
// push in dev), requests permission, subscribes the device with the server's
// VAPID public key, and registers the subscription server-side. Fail-soft: a
// 503 means the server hasn't set VAPID keys yet.
// ──────────────────────────────────────────────────────────

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

const isSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

// Ensure an active SW (main.jsx only registers in prod) before using PushManager.
const ensureRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) { try { await navigator.serviceWorker.register('/sw.js'); } catch { /* ignore */ } }
  return navigator.serviceWorker.ready;
};

export function usePush() {
  const [state, setState] = useState({ supported: isSupported(), subscribed: false, busy: false });

  useEffect(() => {
    let alive = true;
    if (!isSupported()) return undefined;
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => { if (alive) setState((s) => ({ ...s, subscribed: !!sub })); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported()) { toast.error('Push notifications are not supported on this device'); return; }
    setState((s) => ({ ...s, busy: true }));
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast.error('Notifications were not allowed'); return; }

      let publicKey;
      try {
        publicKey = (await meAPI.getVapidKey()).data.data.publicKey;
      } catch (e) {
        toast.error(e?.response?.status === 503 ? "Push isn't configured on the server yet" : "Couldn't start push");
        return;
      }

      const reg = await ensureRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await meAPI.subscribePush({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
      setState((s) => ({ ...s, subscribed: true }));
      toast.success('Notifications enabled');
    } catch {
      toast.error("Couldn't enable notifications");
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  const disable = useCallback(async () => {
    if (!isSupported()) return;
    setState((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await meAPI.unsubscribePush(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState((s) => ({ ...s, subscribed: false }));
      toast.success('Notifications disabled');
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  return { ...state, enable, disable };
}
