---
capability: mobile-learning
status: evolving
owners: [domains/mobile, services/pushService, models/PushSubscription]
last_updated: 2026-06-16
related_code:
  - server/models/PushSubscription.js
  - server/services/pushService.js
  - server/domains/mobile/
  - server/domains/notification/in-app-writer.js
  - client/public/sw.js
  - client/src/features/mobile/usePush.js
  - client/src/features/mobile/TodayPage.jsx
related_plans:
  - plans/260616-1410-b5-mobile-learning-surface/
---

# Capability: Mobile Learning Surface

> **Source of truth for BEHAVIOR.** Modernization Horizon 2 (B5). Turns the
> offline attendance PWA (gap #7) into a learner surface: Web Push notifications
> and a "due today" feed composed from existing Assignment / Schedule data.
> **Status `evolving`:** push DELIVERY is built but dormant until the owner sets
> VAPID env keys (subscribe + feed work regardless); offline-queued quiz
> completion is deferred.

## Purpose

Reach learners on their phone. Installable PWA + Web Push for overdue/due/upcoming
nudges, and a single "Today" feed that surfaces the learner's overdue + due-soon
assignments, upcoming enrolled sessions, and one "do this now" microlearning item
— with no new content model (deeper content is B3).

## Business Requirements (BR)

- **BR-1:** A learner registers a device for Web Push
  (`POST /api/me/push/subscribe`); the subscription is keyed by its unique
  endpoint (idempotent re-subscribe) and removable.
- **BR-2:** Push delivery rides along on the existing in-app notification
  chokepoint (`recordInApp`) — every bell event also pushes — **fail-soft**: a
  no-op when VAPID env keys are unset, and dead (404/410) subscriptions are pruned.
- **BR-3:** `GET /api/me/mobile-feed` returns the requester's own feed: overdue +
  due-soon assignments, upcoming enrolled sessions, and one microlearning nudge,
  composed from existing data (no duplicate content model).
- **BR-4:** All `/api/me/*` routes are self-scoped to `req.user` (any
  authenticated user; no capability) and require authentication.

## Actors & Use Cases (UC)

- **UC-1 (any authenticated learner):** subscribe / unsubscribe a device for push.
- **UC-2:** fetch the server VAPID public key (`GET /api/me/push/vapid-key`) —
  `503` when push is not configured.
- **UC-3:** read the mobile "due today" feed.

## Entities

- **PushSubscription** (`server/models/PushSubscription.js`): `userId`, `endpoint`
  (unique), `keys{p256dh,auth}`, `userAgent`. Disposable device record (hard-delete
  on unsubscribe / 404-410 prune — not user/attendance/evaluation data).

## Functional Requirements (FR)

### Requirement: Push subscription [BR-1, BR-4, UC-1, UC-2]

`POST /api/me/push/subscribe` upserts the device on its endpoint;
`DELETE /api/me/push/subscribe` removes it. `GET /api/me/push/vapid-key` returns
the public key, or `503` when VAPID env keys are unset.

#### Scenario: Idempotent subscribe + unconfigured key
- **GIVEN** a learner subscribes the same device twice
- **THEN** exactly one `PushSubscription` row exists
- **AND** `GET /api/me/push/vapid-key` returns `503` when the server has no VAPID keys

### Requirement: Fail-soft ride-along push [BR-2]

When an in-app notification is recorded (`recordInApp`), `pushService.sendToUser`
also pushes to the recipient's devices — fire-and-forget. With no VAPID env keys
it is a no-op; a 404/410 from the push service prunes that subscription. The
triggering mutation is never affected.

#### Scenario: No keys → no-op, mutation unaffected
- **GIVEN** the server has no VAPID keys
- **WHEN** any event records an in-app notification
- **THEN** push is a silent no-op and the event's mutation still succeeds

### Requirement: Mobile feed [BR-3, BR-4, UC-3]

`GET /api/me/mobile-feed` returns `{ pushEnabled, overdue[], dueSoon[],
upcomingSessions[], microlearning }` for the requester only. Overdue/due-soon
derive from the assignment `listMine` read; upcoming sessions are the learner's
next live enrolled `Schedule` rows; microlearning is the single most-urgent
incomplete item.

#### Scenario: Feed is self-scoped
- **GIVEN** learner A is enrolled in an upcoming session
- **WHEN** learner B requests their mobile feed
- **THEN** B's `upcomingSessions` does NOT include A's session

## Non-Functional Requirements (NFR)

- **Authz:** `/api/me/*` = authenticated + self-scoped (`req.user`); no cross-user data.
- **Fail-soft:** push delivery degrades to a no-op without VAPID keys; subscribe +
  feed remain functional.
- **Composed, not stored:** the feed recomputes on read from Assignment + Schedule.

## Acceptance Criteria (AC)

- [ ] Learner installs the PWA and (with VAPID keys set) receives push for
      overdue/due items and upcoming sessions.
- [ ] The feed composes from existing data — no duplicate content model.
- [ ] Push delivery is fail-soft + prunes dead subscriptions.
- [ ] `/api/me/*` is self-scoped + auth-required.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| `/api/me/*` without auth | 401 | log in |
| `vapid-key` with no VAPID env | 503 | owner sets `VAPID_*` env |
| Push to a dead subscription | pruned (404/410) | device re-subscribes |
| Re-subscribe same device | idempotent upsert | none |

## Out of Scope / Deferred

- **Push DELIVERY activation** — needs the owner to set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate via `npx web-push
  generate-vapid-keys`; the public key also ships to the client via the
  vapid-key endpoint). Until then push is a dormant no-op.
- **Offline-queued quiz completion** — the feed links to the existing online
  flow; reusing the attendance IndexedDB queue for offline quiz attempts is a
  follow-up.
- **Deeper in-app content (video/SCORM)** — explicitly B3 (Horizon 3).
