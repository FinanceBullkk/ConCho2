# Phase 00 — Baseline & Tooling (make the audit measurable)

**Priority:** P0 (gates every other phase) · **Status:** 🔴 todo

## Objective
Stand up the measurements so every later finding is **data-backed**, not
opinion. Capture a baseline snapshot, committed to the findings report.

## Baselines to capture (read-only; no deps added to the repo)
- **Test coverage** — `cd server && npx jest --coverage --coverageReporters=json-summary text` and `cd client && npm run test:coverage`. Record overall % + per-area % (security, finance/budget, transactions, completion engine, schedule booking). Flag any critical path < 70%.
- **Dependency graph** — `npx madge --circular --extensions js,jsx server client/src` (circular deps) + `npx madge --orphans`. Record circular-dep cycles + orphan modules.
- **Dead code / unused** — `npx knip` (unused files, exports, deps, types). Record the unused-surface inventory.
- **Duplication** — `npx jscpd server client/src --min-lines 20 --reporters console` (copy-paste blocks ≥20 lines).
- **DB index inventory** — enumerate every `schema.index(...)` + `index:true` across `server/models/*` into a table; this is the input for the phase-03 index-coverage check.
- **Bundle** — `cd client && npx vite build` chunk table (already emitted); flag chunks > 250 kB gz + duplicate vendor deps.
- **Lint debt** — `cd client && npx eslint . -f json` grouped by rule (the 63 warnings) → burndown candidates.
- **Dependency vulns** — `npm audit --omit=dev` (server + client) → severity + transitive source.
- **Surface counts** — routes mounted (use the repaired `audit-route-permission-diff.js`), models, domains, specs, test files, LOC server/client.

## Method
- Run all probes via `npx` (no permanent devDeps). If a tool needs download and
  the machine blocks it, fall back to a grep/AST script and note the substitution.
- Save raw outputs under `plans/reports/baseline/` (gitignored if large; key
  numbers folded into the report).

## Success criteria
- A `baseline-metrics.md` table exists with every number above.
- Coverage, circular-deps, dead-code, dup, index inventory, bundle, lint-by-rule,
  vuln list all captured. Later phases cite these, not impressions.

## Todo
- [ ] Server + client coverage captured (overall + critical-path %)
- [ ] madge circular + orphans
- [ ] knip unused surface
- [ ] jscpd duplication
- [ ] DB index inventory table
- [ ] bundle chunk table
- [ ] lint-by-rule breakdown
- [ ] npm audit (server+client)
- [ ] surface counts
- [ ] `baseline-metrics.md` written

## Risk
- `npx` tool downloads may be blocked/slow on this machine → fall back to scripts;
  never block the audit on a tool. Note any substitution in the report.
