# Phase 3 — Extract model constants, then drop the 43 Mongoose models

**Priority:** third. **Status:** blocked on P0-a/P0-b. Do after Phase 2.
**This is the trickiest phase** — models are required well beyond `.mongo.js`.

## Overview
`server/models/*` (43 files) are Mongoose schemas. After Phase 2 the `.mongo.js`
repos (their main query consumers) are gone — but a grep shows **non-Mongo runtime
still `require('../models/…')`**, almost always for **enums/constants/field lists**,
not queries. Each such require must be traced and re-pointed before models delete.

## Non-`.mongo.js` runtime requiring models (verified 2026-07-09)
Runtime (must resolve before delete):
- `controllers/class/class-repository.pg.js`, `services/audit-repository.pg.js`
  — PG repos importing a model (enum/constant use — extract).
- `controllers/enrollment/enrollment-transfer.js`
- `domains/assessment/schemas.js`, `domains/assessment/question-bank-schemas.js`
  (zod schemas mirroring model enums)
- `domains/groups/repository.js`, `domains/learning/assignment/reminder-service.js`,
  `domains/learning/completion/expiry-reminder-service.js`,
  `domains/learning/enrollment/prerequisites.js`, `domains/learning/path/use-cases.js`
- `helpers/cohortMembership.js`, `helpers/counter.js`, `helpers/teacher-class-scope.js`

Scripts (Phase 5 disposition, not runtime): ~25 `scripts/*` require models.

## Strategy
1. **Classify each model require:** (a) query use → already dead post-Phase-2,
   remove; (b) enum/constant/status-list/field-name use → **extract the constant**
   to a plain module (e.g. `domains/<x>/constants.js` or `server/constants/`), then
   re-point the importer.
2. Prefer a small shared `server/constants/` (or per-domain `constants.js`) for
   the extracted enums (roles, statuses, delivery types, etc.). DRY: one source.
3. After all runtime importers are off models, delete `server/models/*` (43).
4. Remove any `require('mongoose')` left in runtime (should be zero post-delete).

## Steps
1. For each runtime file above: open, find the model symbol used, extract or inline
   the constant, re-point, run that area's tests.
2. Sweep `grep -rn "require(.*/models/" server --include=*.js` excluding scripts/tests
   → must reach zero for runtime.
3. Delete `server/models/*`; grep `require('mongoose')` in runtime → zero.
4. Full PG Jest + client + lint green.

## Watch-outs
- Some models define **shared validation enums** also used by zod schemas — extract
  once, import in both the schema and any use-case (avoid divergence).
- `helpers/counter.js` uses both `DB_BACKEND` (Phase 2) and a model — handle its
  model require here.
- Do not delete models that a KEPT script genuinely needs until Phase 5 decides the
  script's fate; if a kept script needs a model, that script must be PG-ported too.

## Success criteria
- `server/models/` empty/removed; no runtime `mongoose` require; enums live in
  plain constant modules; suite + lint green.

## Open questions
- Where should extracted constants live — `server/constants/` (central) vs
  per-domain `constants.js` (colocated)? Recommend per-domain colocation to match
  the modular-monolith convention, with truly cross-cutting enums (roles) central.
