# Frontend Conventions

Client is **ESM** + React 19 + Vite. Pages are lazy-loaded route views; logic lives in hooks.

## Server state = React Query (never useEffect+fetch)
- All API access goes through per-resource objects in `client/src/api/api.js` (axios instance with interceptors: CSRF header, 401 handling).
- Wrap reads/writes in hooks (e.g. `useLearning.js`) — colocated in the feature module when one exists, else under `client/src/hooks/`.
- Query keys are centralized in `client/src/hooks/queryKeys.js` — reuse them; don't inline ad-hoc key arrays. Invalidate via the same keys after mutations.

## Feature modules (`features/<domain>/`) — migration essentially complete
The client uses feature colocation under `client/src/features/<domain>/`, mirroring
the backend `server/domains/<domain>/` boundaries. 16 feature folders live here
(rooms, org, reconcile, settings, sync, evaluations, schedule, attendance, users,
groups, dashboard, classes, learning, learner, auth, admin). **Only composition
shells stay in `pages/`** — `PeoplePage`, `SystemPage`, `ReportsPage`, `CalendarPage`
(they assemble tabs from several domains; they are routing glue, not a domain). New
domain pages go under `features/<domain>/`, not `pages/`.
- A feature folder colocates that domain's **page(s), domain hook(s), feature-local
  components, and tests** (`__tests__/`). Example pilot: `features/rooms/`
  (`RoomsPage.jsx` + `useRooms.js` + `__tests__/`).
- **Keep the central API client** (`api/api.js`) and the shared `queryKeys.js` —
  the feature hook imports `roomsAPI`/`qk` from there. `features/` colocates
  feature code, it does NOT fragment the shared axios client.
- **Shared/cross-cutting stays shared:** `components/ui/`, `components/` shells,
  `context/`, `lib/`, generic hooks (`useRole`, `useDebounce`). A feature may import
  another feature's hook when the domain is genuinely shared (e.g. learning's
  `CreateSessionModal` imports `features/rooms/useRooms`).
- When migrating a domain: `git mv` the files, fix relative import depth (`pages/` and
  `hooks/` are both 2 levels from `src/` → `features/<domain>/` is also 2; `__tests__/`
  is 3), update every importer + `vi.mock(...)` path, then run build + `test:run` + lint
  (must stay ≤ cap). Not-yet-migrated domains remain under `pages/`/`hooks/` — both
  layouts coexist during the migration.

## Forms = react-hook-form + zod
Define the zod schema (often in `client/src/lib/`), wire with `@hookform/resolvers/zod`. No manual `useState` form plumbing.

## i18n (English-only)
- The product is **English-only** — a single `en` locale, no Vietnamese, no
  language detector/switcher (`vi.json` was removed).
- Prefer routing user-facing strings through `react-i18next` `t('key')` backed by
  `client/src/i18n/locales/en.json` (the dominant pattern). English literals are
  acceptable in the `/me/*` learner pages, which were written that way; do not add
  new Vietnamese strings anywhere.

## UI components
- Build on Radix primitives + the shadcn-style components in `components/ui/`. Use `cn()` (clsx + tailwind-merge) for class composition.
- Tailwind 4 utility-first. Respect dark/light mode (`next-themes`) — use theme tokens, not hardcoded colors.

## Auth & roles
- `context/AuthContext` holds the session. Use the role hook to gate UI (hide buttons users can't use).
- UI gating is UX only — the server enforces real authz. Never assume the client check is the security boundary.

## Lint
ESLint is a REQUIRED CI gate with a ratchet cap (see testing-and-ci.md). Hard errors that always block: `no-undef`, `no-unused-vars`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`. Don't add `eslint-disable` to dodge these — fix the cause.
