# Frontend Conventions

Client is **ESM** + React 19 + Vite. Pages are lazy-loaded route views; logic lives in hooks.

## Server state = React Query (never useEffect+fetch)
- All API access goes through per-resource objects in `client/src/api/api.js` (axios instance with interceptors: CSRF header, 401 handling).
- Wrap reads/writes in hooks under `client/src/hooks/` (e.g. `useLearning.js`).
- Query keys are centralized in `client/src/hooks/queryKeys.js` — reuse them; don't inline ad-hoc key arrays. Invalidate via the same keys after mutations.

## Forms = react-hook-form + zod
Define the zod schema (often in `client/src/lib/`), wire with `@hookform/resolvers/zod`. No manual `useState` form plumbing.

## i18n (mandatory for user-facing text)
- Every user-visible string goes through `react-i18next` `t('key')`. No hardcoded UI copy.
- Add keys to BOTH `client/src/i18n/locales/en.json` and `vi.json`. Missing a locale breaks parity.

## UI components
- Build on Radix primitives + the shadcn-style components in `components/ui/`. Use `cn()` (clsx + tailwind-merge) for class composition.
- Tailwind 4 utility-first. Respect dark/light mode (`next-themes`) — use theme tokens, not hardcoded colors.

## Auth & roles
- `context/AuthContext` holds the session. Use the role hook to gate UI (hide buttons users can't use).
- UI gating is UX only — the server enforces real authz. Never assume the client check is the security boundary.

## Lint
ESLint is a REQUIRED CI gate with a ratchet cap (see testing-and-ci.md). Hard errors that always block: `no-undef`, `no-unused-vars`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`. Don't add `eslint-disable` to dodge these — fix the cause.
