# Backend Conventions

Server is **CommonJS** (`require` / `module.exports`). Do not use ESM here.

## Response envelope (always)
Success: `res.json({ success: true, data, count? })` (`count` for lists).
Error:   `res.status(4xx).json({ success: false, message })`.
Never echo internal errors/stack to the client.

## Controller pattern
Thin handlers. Wrap in `try/catch`, delegate to use-cases/services, funnel errors through `handleError`:
```js
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

const createProgram = async (req, res) => {
  try {
    const data = await useCases.createProgram(req.body);
    auditService.record({ req, action: 'created', entity: 'LearningProgram', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};
```

## Layering
`routes → controller → use-cases/service → repository/Mongoose`.
- **New code:** follow the domain module convention (see domain-model-and-migration.md). Keep Mongoose calls behind a `repository.js`.
- **Legacy code:** `controllers/` call `services/` directly. When touching a large legacy controller, prefer extracting into `domains/` over growing it.

## Audit logging (mandatory for mutations)
Every create/update/delete/archive records an audit entry via `auditService.record({ req, action, entity, entityId, diff })`. For updates, fetch `before`, then `diff: auditService.diff(before, after)`. Passwords/secrets are auto-redacted in diffs.

## Authorization is two-layered
1. `middleware/roleGuard('Admin', 'Teacher', ...)` — coarse role check ("can this role hit this URL?").
2. `server/policy/*` — resource-level ("can THIS actor touch THIS doc?"). Pure fns: `canDoX(actor, doc, opts) → { allowed, reason }`. The controller fetches the target doc, calls the policy fn, then `if (!decision.allowed) return policyDeny(res, decision)`. (No generic middleware wrapper today — call policies directly. `policy/README.md` sketches a `requirePolicy` middleware that isn't implemented yet.) See `server/policy/README.md`.
- Some policies use "open until populated" graceful migration (permissive on empty legacy fields). Preserve this behaviour unless intentionally backfilling.

## Validation
Validate request bodies with **zod** (`server/schemas/`) via the `validate` middleware. Don't trust client input.

## Transactions
Multi-document mutations that must be atomic (group transfer, schedule edits, roster rebuild) use Mongoose sessions/transactions. Don't leave data half-written — all-or-nothing.

## Concurrency
Double-booking is prevented by a UNIQUE index `{classId, startTime}` on `Schedule` — the DB is the final guard, not just app logic. Handle the duplicate-key error as a user-facing "slot taken" message.

## Logging
Use the request-scoped pino logger (`req.log`), not `console.log`. Logs are structured and request-id traced.
