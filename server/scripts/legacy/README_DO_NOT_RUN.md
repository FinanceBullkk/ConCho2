# ⛔ Legacy Import Scripts — DO NOT RUN

These scripts are archived here for reference only. They **must not be run** against any database (development, staging, or production) without explicit review and sign-off.

## Why they are dangerous

| Script | Risk |
|---|---|
| `import_phase1.js` | Hard-codes `localhost:3000` API, hard-coded admin credentials (`000001/admin12345`) |
| `import_phase1_v2.js` | Marks **all existing Ongoing classes as Completed** to bypass validation — destroys active class state |
| `import_phase1_v3.js` | Same as v2; also hard-codes API base and credentials |
| `import_via_api.js` | Hard-coded `localhost:3000`, hard-coded login credentials |
| `import_levels.js` | Superseded by `reimport_from_excel.js` and `reimport_from_raw.js` |

## What to use instead

- **Bulk user import:** `reimport_from_excel.js` or `reimport_from_raw.js` (both require `CONFIRM_WIPE=YES`)
- **Historical attendance:** `POST /api/import/history` via `importController.bulkImportHistory`
- **Counter fix:** `fix_class_counter.js`

## To permanently delete

If you are certain these scripts are no longer needed:

```bash
git rm server/scripts/legacy/import_phase1.js
git rm server/scripts/legacy/import_phase1_v2.js
git rm server/scripts/legacy/import_phase1_v3.js
git rm server/scripts/legacy/import_via_api.js
git rm server/scripts/legacy/import_levels.js
```
