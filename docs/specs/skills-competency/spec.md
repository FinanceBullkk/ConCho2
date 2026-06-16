---
capability: skills-competency
status: stable
owners: [domains/skill, models/Skill]
last_updated: 2026-06-16
related_code:
  - server/models/Skill.js
  - server/domains/skill/
  - server/domains/skill/proficiency.js
  - server/policy/capabilities.js
  - client/src/features/skills/
related_plans: []
---

# Capability: Skills & Competency Framework

> **Source of truth for BEHAVIOR.** Named workforce skills that LearningPrograms
> "build", a **derived** per-learner proficiency, role-target gap analysis, a
> taxonomy, and **gap-driven program recommendations**. Started as TMS.update
> gap #4 (derived badge); promoted to an engine by Modernization Horizon 1 (B2,
> skills-as-spine) — the deterministic foundation the later AI layer (B1) builds on.

## Purpose

Make competency real and computable from existing data: declare skills (and
which programs build them), set per-role target levels, and derive each
learner's proficiency from what they have actually completed. From that, surface
role gaps and recommend the programs that close the most gap — no stored,
drift-prone proficiency.

## Business Requirements (BR)

- **BR-1:** Admins manage skills (`name`, `category`, optional taxonomy `parentId`,
  `programIds`, `maxLevel`, `targetByRole`, `coverageTarget`) — `skill.manage`;
  every mutation audited; soft-delete.
- **BR-2:** Proficiency is **DERIVED**, never stored: each completed contributing
  program (signal = Issued `Certificate`) adds +1 level, capped at `maxLevel`.
- **BR-3:** Role gap for a skill = `targetByRole[role] − derived level` (floored at
  0); only skills with a positive target for the role count.
- **BR-4:** Taxonomy — skills carry a `category` and an optional `parentId`;
  `GET /api/skills/taxonomy` returns them grouped by category and nested by parent.
- **BR-5:** Recommendations rank **active** programs the learner hasn't completed
  by how many gapped role-skills they advance (deterministic; ties on remaining
  gap, then name). The AI layer (B1) may re-rank later without changing the contract.
- **BR-6:** Authz — `skill.read` lists skills/taxonomy and reads OWN learner
  proficiency + recommendations; `skill.manage` covers CRUD, role-profiles, and
  any learner's data. Learner reads are self-scoped in the controller.

## Actors & Use Cases (UC)

- **UC-1 (`skill.manage`):** create / edit / archive a skill; set program mapping,
  role targets, and taxonomy parent.
- **UC-2 (`skill.read`):** browse skills (`GET /api/skills`) + taxonomy tree
  (`GET /api/skills/taxonomy`).
- **UC-3 (`skill.read`, self-or-manage):** view a learner's derived proficiency +
  role gap (`GET /api/skills/learner/:userId`).
- **UC-4 (`skill.read`, self-or-manage):** view a learner's gap-driven program
  recommendations (`GET /api/skills/learner/:userId/recommendations`).
- **UC-5 (`skill.manage`):** view per-role required-skill coverage
  (`GET /api/skills/role-profiles`).

## Entities

- **Skill** (`server/models/Skill.js`): `name` (unique among live, case-insensitive),
  `category`, `parentId` (nullable taxonomy parent), `programIds` (programs that
  build it), `maxLevel`, `targetByRole` ({roleKey: level}; 0/absent = not required),
  `coverageTarget`, `hue`, soft-delete. Stores the RULE/mapping only — no proficiency.
- Proficiency + gap + recommendations are pure derivations
  (`server/domains/skill/proficiency.js`).

## Functional Requirements (FR)

### Requirement: Derived proficiency + role gap [BR-2, BR-3, UC-3]

`GET /api/skills/learner/:userId` returns acquired skills (level ≥ 1, with the
programs that built them) and the role profile (required skills with `target`,
`level`, `gap`). Level = count of completed contributing programs, capped at
`maxLevel`.

#### Scenario: One completion lifts level and shrinks the gap
- **GIVEN** a skill required at level 2 for the learner's role, built by a program
  the learner holds an Issued certificate for
- **WHEN** their skills are requested
- **THEN** the skill reports `level:1`, `target:2`, `gap:1` and lists the program under `via`

### Requirement: Taxonomy tree [BR-1, BR-4, UC-2]

`GET /api/skills/taxonomy` returns `{ categories:[{ category, skills:[node…] }],
total }` where each node nests its `children` by `parentId`. A skill whose parent
is missing/archived is promoted to a root (never dropped). A skill cannot be its
own parent (400 on update).

#### Scenario: Child nests under parent within its category
- **GIVEN** "Public speaking" has `parentId` = "Communication" (both in "Soft skills")
- **WHEN** the taxonomy is requested
- **THEN** the "Soft skills" category lists "Communication" with "Public speaking"
  among its `children`

### Requirement: Gap-driven recommendations [BR-5, BR-6, UC-4]

`GET /api/skills/learner/:userId/recommendations` returns `{ learner,
recommendations:[{ programId, name, gapClosed, skills[] }], totalGaps }`, ranked
by `gapClosed` desc. Only **active** programs the learner hasn't completed are
candidates; archived/inactive programs are never recommended.

#### Scenario: A program touching more gaps ranks first; archived excluded
- **GIVEN** program A builds two gapped role-skills, program B one, and an archived
  program builds another gapped skill
- **WHEN** recommendations are requested
- **THEN** program A is first (`gapClosed:2`), B is listed (`gapClosed:1`), and the
  archived program is absent

#### Scenario: Self-or-manage
- **GIVEN** a Participant requests another learner's recommendations
- **WHEN** they lack `skill.manage`
- **THEN** the request is `403`; their OWN recommendations return `200`

## Non-Functional Requirements (NFR)

- **Authz:** `skill.read` (lists/taxonomy/own) vs `skill.manage` (CRUD/role-profiles/
  any learner); learner reads self-scoped; mutations audited (`entity:'Skill'`).
- **Derived, not stored:** proficiency/gaps/recommendations recompute on read from
  Skill mapping + Certificate state.
- **Deterministic recommendations:** stable ordering, reproducible without the AI layer.

## Acceptance Criteria (AC)

- [ ] Skill CRUD (mapping, role targets, taxonomy parent), soft-delete, audited; `skill.manage`.
- [ ] Proficiency derived from certified completions, capped at `maxLevel`; never stored.
- [ ] Role gap = target − level; surfaces on the learner Skills view.
- [ ] Taxonomy tree groups by category + nests by parent; self-parent rejected.
- [ ] Recommendations rank active programs by gap closed; archived excluded; self-or-manage.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manage without `skill.manage` | 403 | Admin |
| Read another learner without `skill.manage` | 403 | view own, or use a manage role |
| Duplicate skill name (case-insensitive) | 409 | pick another name |
| Skill set as its own parent | 400 | choose a different parent |
| Learner with no completions | empty skills, all gaps open | complete mapped programs |

## Out of Scope / Deferred

- AI-ranked recommendations (B1) — layers on top of the deterministic ranking here.
- Deep taxonomy cycle detection (only self-parenting is blocked; the hierarchy is
  a shallow admin-curated tree).
- Stored/teacher-assessed proficiency — proficiency is derivation-only today.
- Per-`RoleProfile` model — role targets live on `Skill.targetByRole` by design.
