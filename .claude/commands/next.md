---
description: Implement the next roadmap milestone end-to-end (execute the map + auto-update tracker)
---

Follow `.claude/rules/implementation-workflow.md` exactly.

**Target:** $ARGUMENTS
(If empty, pick the next `🟡`/`🔴` milestone in `docs/development-roadmap.md` by order M1 → M4.)

Execute the full workflow:
1. Read the map (`docs/development-roadmap.md` + `lms-roadmap.md` + relevant `plans/`).
2. Implement per conventions (extend `domains/`, i18n both locales, audit, soft-delete).
3. Verify: `cd server && npm test`, `cd client && npm run test:run`, `cd client && npm run lint`.
4. **Auto-update the tracker** (`development-roadmap.md` status/%/changelog; sync `handoff`) — part of Definition of Done.
5. Commit (conventional, no AI refs, explicit paths).

Auto-run and auto-commit. Pause and ask only if blocked, if a decision is the user's to make, or **before `git push`**.
