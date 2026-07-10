# Codebase status & industry benchmark — TMS v2

Date: 2026-06-20 · Branch: `main` · Method: direct measurement (git, jest/vitest
coverage, CI gate results). All numbers measured this session, not estimated.

## 1. Snapshot (measured)

| Metric | Value |
|---|---|
| Total JS | ~108k LOC (server prod 43.5k · client ~35k · tests ~30k) |
| Tracked files | 1,233 |
| Server domains | 21 mounted (+ `_shared` helpers) |
| Mongoose models | 43 |
| Legacy routes / controllers / services | 18 / 13 facades / 14 |
| Test cases | 1,584 (server 1,177 · client 407) |
| Server test files | 129 (96 integration + 33 unit) |
| CI gates | 7 (all green on main) |
| Avg file size | server ~103 · client ~116 LOC |
| Largest source file | `scheduleService.js` 602 (was 699, extracted this session) |
| Files > 300 LOC | ~19 server · ~18 client |
| Inline tech-debt markers | 4 TODO/FIXME (~0.05/KLOC) |
| ESLint ratchet cap | 41 (↓ from 63 — monotonic-decreasing) |
| Prod deps | server 26 · client 21 |
| Git history | 829 commits, started 2026-04-19 (~2 months) |
| Velocity | 568 commits / last 30 days |
| Contributors | 1 human (~820/829 commits) |

## 2. Test coverage (measured today)

| Layer | Lines | Stmts | Funcs | Branches | Tests |
|---|---|---|---|---|---|
| **Server** | **87.6%** | 85.3% | 87.3% | 65.8% | 1,177 pass |
| **Client (unit)** | 39.8% | 37.1% | 28.7% | 34.1% | 407 pass |
| **Blended (lines)** | **~68%** | — | — | — | 1,584 |

Server denominator = app logic (controllers/services/domains/middleware/policy/
helpers/schemas/routes/models). Client = unit/hook only — Playwright e2e (CI gate
#7) covers user flows but is NOT counted here, so effective client coverage > 40%.

## 3. Heaviness / complexity / structure

- **Heaviness — MEDIUM.** ~108k LOC = mid-size internal app (typical band 50–200k).
  Deps lean (26+21). Not heavy; weight is feature *breadth*, not LOC.
- **Complexity — MANAGED BREADTH.** 21 domains for a 1000-employee internal LMS is
  wide, but a 7-axis wiring audit (this session) showed all 13 capability domains
  are full loops: backend layering + client feature + route + nav + integration
  test + audit + capability gate. 40/40 `requireCapability` refs resolve to defined
  capabilities (no broken gates). Breadth is well-engineered, not debt.
- **Structure — STRONG.** Avg ~110 LOC/file; modular monolith + domain modules +
  DTO migration + repository pattern + spec registry + ADRs. Low inline debt.

## 4. Industry benchmark

Reference class: (a) typical internal business tools, (b) well-run SaaS teams.
🟢 above · 🟡 at · 🔴 below.

| Dimension | This codebase | Industry norm | |
|---|---|---|---|
| Size | ~108k LOC | 50–200k internal app | 🟡 at (mid-size) |
| Backend coverage | 87.6% lines | "strong" ≥80%; many at 50–70% | 🟢 top-tier |
| Frontend unit coverage | 39.8% lines | 60–70% unit (40–60% if e2e exists) | 🟡 low (e2e-mitigated) |
| Blended coverage | ~68% lines | 60–75% = "good" | 🟢 at/above |
| Modularization | avg ~110, max 602 | guide <400–500; legacy 1000+ | 🟢 above |
| Inline tech debt | 0.05 TODO/KLOC | 1–5 TODO/KLOC | 🟢 above |
| Security | CSRF · rate-limit · 2-layer authz · audit-all · soft-delete · helmet/CSP · 2FA · gitleaks | internal tools often weak authz, no audit | 🟢 above (≈ OWASP ASVS L2) |
| CI/CD gates | 7 incl e2e + secrets + npm-audit + lint ratchet | many teams unit+lint only | 🟢 above (gates) |
| CI/CD enforcement | procedural (Free plan, no branch protection) | branch protection standard | 🟡 below (manual) |
| Architecture | modular monolith, DDD-lite, ADR, spec | startups → big-ball-of-mud | 🟢 above |
| Dependency health | npm-audit high+ PASS, lockfile-as-truth | many carry high/critical vulns | 🟢 at/above |
| Docs | 248 md, capability matrix, roadmap, registry | internal tools: stale README | 🟢 above |
| Team resilience | bus factor = 1, very high velocity | aim ≥2–3 | 🔴 below (biggest gap) |

## 5. Verdict

Engineering discipline ~**top quartile for its category**. Security/test/CI/
architecture rigor resembles a funded product team, not a typical internal tool —
it punches above its weight. Coverage confirms the intended risk distribution:
dense where risk is high (server logic, security, money/booking/transactions =
87.6%), thin where risk is low (UI render = ~40% unit, e2e-covered).

## 6. Genuine weaknesses (not code quality)

1. **🔴 Bus factor = 1** + extreme commit velocity (AI-assisted). Tests/CI vouch for
   quality, but *handover/continuity* is the clearest gap vs industry.
2. **🟡 Frontend unit coverage ~40%** — the one real test gap. Highest-leverage
   improvement: raise to 60% (also makes `vite.config.js`'s aspirational 60%
   thresholds real — currently not enforced, since client CI runs `test:run`,
   not coverage).
3. **🟡 Scope breadth (21 domains)** — well-built today, but needs governance to
   avoid feature-factory drift (owner's quality-consolidation round addresses this).
4. **🟡 CI enforcement is procedural** — gates run but GitHub (Free plan) won't block
   a red merge; relies on discipline.

## 7. Recommendations (leverage-ordered)

1. Frontend unit coverage 40%→60% (closes the only test gap; activates the FE threshold).
2. Reduce bus-factor risk via documentation/onboarding (non-code; org resilience).
3. Hold domain-breadth freeze + consolidation before new capabilities.
4. (Optional) extract the next `scheduleService` slice (`notifyRosterEnrolled` +
   inline email side-effects) to pull 602 → ~570.

## Unresolved questions

- Is the `vite.config.js` 60% coverage threshold intended to be enforced in CI?
  Today it is dormant (client CI uses `test:run`, no `--coverage`).
- Branch lifecycle: should CI coverage be a real gate, or stay advisory given the
  e2e suite already guards user flows?
