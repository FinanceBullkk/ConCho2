# Scope-trim: delete 9 speculative capability domains

> Decision + rationale: [`docs/decisions/trim-speculative-capability-domains.md`](../../docs/decisions/trim-speculative-capability-domains.md).
> Runs on `chore/scope-trim-delete-domains` (off main `13a217c`, has Wave K Phase 1
> + sidebar-trim). **Before Wave K Phase 2** — shrinks the collapse from ~58→~30 seams.

## Delete (9) · Keep (4)
- **DELETE:** access · automation · finance · mobile · planning · session-type · skill · trainer · vendor
- **KEEP:** notification · custom-field · branding (core-coupled) · compliance (on-mission)

## Per-domain removal
| Domain | server folder | route mount (server.js) | models | client feature | spec |
|---|---|---|---|---|---|
| access | `domains/access/` | `/api/access` (279) + boot `grants-loader` (412) | Role | `features/access` | — |
| automation | `domains/automation/` | `/api/automation` (289) + boot `runner.register` (298) + `seed` (419) | AutomationRule | `features/automation` | — |
| finance | `domains/finance/` | `/api/finance` (266) | Budget, CostEntry | `features/finance` | budget-and-cost |
| mobile | `domains/mobile/` | `/api/me` (288) | PushSubscription | `features/mobile` | mobile-learning |
| planning | `domains/planning/` | `/api/planning` (269) | TrainingRequest, TrainingPlan | `features/planning` | — |
| session-type | `domains/session-type/` | `/api/session-types` (264) | SessionType | — | — |
| skill | `domains/skill/` | `/api/skills` (290) | Skill | `features/skills` | skills-competency |
| trainer | `domains/trainer/` | `/api/trainers` (268) | TrainerProfile | `features/trainer` | trainer-management |
| vendor | `domains/vendor/` | `/api/vendors` (267) | Vendor | `features/vendor` | vendor-management |

Also delete each domain's **tests**: `server/tests/integration/<domain>*`,
`server/tests/pg-parity/<domain>*`, `server/tests/unit/<domain>*`, and client
`features/<domain>/__tests__`.

## Coupling cuts (NOT pure rm — do carefully)
1. **mobile → pushService → kept `notification`.** Delete `services/pushService.js`
   + the `web-push` dep + the `pushService` call in `domains/notification/in-app-writer.js`
   (Web Push feature goes; notification's email + in-app-bell stay). Delete `PushSubscription`.
2. **access boot hook.** Remove `grants-loader.initRoleGrants()` (server.js ~412).
   Authz falls back to the static `policy/capabilities.js` map. **Verify `Role.js`
   has no other kept consumer** before deleting it (grep `models/Role'`).
3. **automation boot hooks.** Remove `runner.register()` (~298) + `seed.seedSystemRules()` (~419).
4. **Orphan `meta jsonb` fields** on Schedule (`sessionTypeId`/`vendorId`/`externalTrainer`)
   — leave as-is (free-form, harmless); no schema change needed.
5. **Event bus:** deleted domains that subscribe (automation/mobile) just stop
   subscribing; core publishers are unaffected. Grep `event-bus` subscribers for dangling refs.

## Docs to update
- `.claude/rules/domain-model-and-migration.md` — "20 domains" → 11; drop the 9 from the inventory.
- `.claude/rules/project-structure.md` — domain count if referenced.
- `docs/current-system-map.md` + `docs/system-overview.md` — domain lists/counts.
- `docs/specs/README.md` (registry) — remove the 5 deleted specs' rows; `git rm` the 5 spec dirs.
- `docs/development-roadmap.md` — changelog entry (top) + status board; roll old if needed.
- `client/src/config/features.js` + `nav-config.js` — remove the 9 domains' flags/nav entries (were hidden; now gone).

## Execution order (each step tests green)
1. **Server delete** (agent A): 9 folders + 11 models + server.js mounts/boot hooks + coupling cut #1–#3 + server tests. Grep dangling requires = 0.
2. **Client delete** (agent B, parallel — no server overlap): 8 `features/` + nav/features.js + fix importers. `vite build` + `test:run` + lint ≤ cap.
3. **Docs sweep** (me): the list above.
4. **Verify:** `grep -rE "domains/(access|automation|finance|mobile|planning|session-type|skill|trainer|vendor)"` server/client (non-deleted) = 0 requires; full server Jest BOTH lanes + client + lint locally (deps ready in worktree); then PR CI (both lanes + e2e) is the gate.
5. Commit per area; open PR. **Merge only when all 9 gates green.**

## DoD
- ☑ 9 server domains + 11 models + their tests gone; route mounts + boot hooks removed
- ☑ Web Push feature removed; `Role` delete verified safe; authz on static map
- ☑ 8 client features + flags/nav gone; build + test:run + lint green
- ☑ Docs/specs/registry/roadmap updated; ADR committed
- ☑ Full suite green BOTH lanes + e2e (PR CI); merged

## Open questions
- `Role.js` — confirm zero kept consumers (auth/capability) before deleting (step 1 verifies).
- Any `docs/specs/` beyond the 5 found (planning/automation/access/session-type) — grep registry.
