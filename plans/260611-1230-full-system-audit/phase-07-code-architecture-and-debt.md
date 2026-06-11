# Phase 07 — Code Architecture & Debt

**Area prefix:** CODE- (continue past CODE-007).
**Sources:** `.claude/rules/project-structure.md`, `domain-model-and-migration.md`,
`docs/current-system-map.md`.

## A. Migration debt map (legacy → domains/)
- [ ] Inventory the 19 legacy `routes/` + 15 `controllers/` files: for each —
      already a thin facade? has a `domains/` target? actively growing (git log
      last 3 months)? Rank by (size × churn) for extraction priority.
- [ ] Vocabulary migration table status (Class→Cohort done via DTO; Team→
      LearningGroup, Evaluation→Assessment, Enrollment→cohort-based NOT done):
      cost of each remaining row vs benefit — recommend keep/do/drop with owner.
- [ ] `schedule/` adapter domain: anything else delegating through legacy
      controller that should get own routes (plan said "repository interfaces,
      schedule domain routes" remain from Phase 1)?

## B. File size & module hygiene
- [ ] >200-line file inventory (excluding sanctioned: scheduleService ~511,
      syncController ~314) — extraction candidates with logical seams named.
- [ ] Circular-dependency lazy-require inventory: every `require()` inside a
      function — document the cycle it dodges; any now removable?
- [ ] Dead code: unused exports/files (manual + `npx knip` if it behaves on CJS);
      unused deps in both package.json.
- [ ] Duplicate logic: capacity/audience checks, date/slot helpers — single
      source each? (DRY pass, no speculative abstraction.)

## C. Frontend architecture
- [ ] `features/` migration completeness: anything left in `pages/`/`hooks/`
      that belongs to a domain folder? Composition shells still shells?
- [ ] `components/ui` divergence from shadcn upstream — documented mods only.
- [ ] Prop drilling / context bloat hotspots (AuthContext scope creep check).
- [ ] Import-depth/path consistency (relative-depth bugs were a migration
      hazard — sweep for `../../..` weirdness).

## D. Dependencies & platform
- [ ] `npm outdated` both packages: majors pending (Express 5? Mongoose 9?) —
      risk note each, no upgrades inside the audit round.
- [ ] **googleapis pin decision** (the lockfile-drift root cause): pin exact or
      adopt `overrides` → lets server CI return to `npm ci`. Recommend.
- [ ] Node >=18 engines vs CI (22 server / 20 client) vs Render runtime — align.

## Method
Read-and-measure (cloc, git churn, grep); produce the ranked debt table.
This phase mostly yields BACKLOG + 2–3 cheap high-value extractions, not a
rewrite — no-feature-factory rule applies to refactors too.

## Output
`plans/reports/audit-code-{yymmdd-hhmm}-findings.md` + small refactor PRs (≤3).
