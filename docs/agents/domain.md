# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **multi-context** monorepo: one product (TMS v2 / Internal LTMS) split across `client/` (React SPA) and `server/` (Express API).

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context (`client/`, `server/`). Read each one relevant to the topic.
- **`client/CONTEXT.md`** / **`server/CONTEXT.md`** — context-scoped domain language for the area you're working in.
- **`docs/decisions/`** — system-wide architecture decisions (this repo's ADRs). Read the ones that touch the area you're about to work in. (Examples today: `ld-domain-vocabulary.md`, `ld-platform-modular-monolith.md`, `mongo-now-postgres-later.md`.)

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

> Note: this repo stores ADRs under `docs/decisions/`, not the seed default `docs/adr/`. The vocabulary migration table also lives in `docs/decisions/ld-domain-vocabulary.md` and `.claude/rules/domain-model-and-migration.md` — treat those as the authoritative glossary until a `CONTEXT.md` exists.

## File structure

```
/
├── CONTEXT-MAP.md                    ← points at per-context CONTEXT.md files
├── docs/decisions/                   ← system-wide ADRs
│   ├── ld-domain-vocabulary.md
│   ├── ld-platform-modular-monolith.md
│   └── mongo-now-postgres-later.md
├── client/
│   └── CONTEXT.md                    ← frontend domain language (lazy)
└── server/
    └── CONTEXT.md                    ← backend domain language (lazy)
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md` — or, until those exist, the migration table in `docs/decisions/ld-domain-vocabulary.md`. Respect the legacy→target mapping (e.g. `Class`→Cohort, `Schedule`→Session); don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing decision in `docs/decisions/`, surface it explicitly rather than silently overriding:

> _Contradicts `mongo-now-postgres-later.md` — but worth reopening because…_
