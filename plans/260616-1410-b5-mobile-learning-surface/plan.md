# B5 — Mobile as a Learning Surface (Modernization Horizon 2)

Status: in progress. Builds on the offline PWA shell (gap #7, shipped): `client/public/sw.js`,
`main.jsx` SW registration, `features/attendance/useOfflineAttendance.js` (IndexedDB queue).

## Goal
Turn the attendance-only PWA into a learner surface: web-push notifications, a
"due today" feed (overdue + upcoming + a microlearning nudge), composed from
existing Assignment / Schedule data. No duplicate content model (deeper content = B3).

## Scope (this slice)
**Server:**
- `PushSubscription` model: { userId, endpoint (unique), keys{p256dh,auth}, userAgent }.
- `services/pushService.js`: `web-push` wrapper — `isConfigured()`, `getPublicKey()`,
  `sendToUser(userId,{title,body,url})`. **Fail-soft** when VAPID env absent (no-op + log);
  prune dead subscriptions on 404/410. Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- `domains/mobile/` mounted at `/api/me` (protect, self-scoped — any authenticated learner):
  - GET `/push/vapid-key` · POST `/push/subscribe` · DELETE `/push/subscribe`
  - GET `/mobile-feed` → { overdue[], upcoming[], microlearning } composed from
    assignment `listMine` (overdue/due) + Schedule (upcoming enrolled sessions).
- **Push trigger:** hook `pushService.sendToUser` into `domains/notification/in-app-writer.recordInApp`
  (fail-soft ride-along) → push fires for every bell event (assignments/reminders/etc.).
- `web-push` dep (regenerate lockfile with `npx npm@10`).

**Client:**
- `sw.js`: add `push` + `notificationclick` handlers.
- `features/mobile/usePush.js` (subscribe via `serviceWorker.ready` + VAPID public key) +
  a "Today" feed view + an "Enable notifications" button. i18n.

## Deliberate deferrals (documented)
- **Offline-queued quiz completion** — the feed links to the existing online quiz;
  reusing the attendance IndexedDB queue for offline quiz attempts is a follow-up.
- **Deeper in-app content (video/SCORM)** — explicitly B3 (Horizon 3).
- Push DELIVERY needs the owner to set VAPID env keys; until then push is fail-soft no-op
  (subscribe + feed still work). I generate the VAPID keypair; the PRIVATE key is a secret (env, not committed).

## Gates
server jest · client vitest · lint ≤63 · vite build · `npm ci` clean (lockfile). Repo public → CI free.
