# Incident — employee training workbook tracked in Git

**Date discovered:** 2026-07-22  
**Classification:** Privacy / source-data exposure  
**Status:** Repository private and local containment complete; remote history rewrite and stakeholder review pending

## Summary

The application repository contained a source workbook under `Data/` with
employee identity and training-attendance fields. The file was reachable from
published Git history, including an older nested `ConCho2/Data/` path. Deleting
only the current file would not remove either historical blob.

Repository documentation described the application repository as public. Its
current GitHub visibility could not be independently verified during response,
so this incident assumes the higher-risk exposure model until the owner proves
otherwise.

## Local containment performed

- Inventoried every branch, remote-tracking branch, tag, and internal tree ref.
- Rebuilt all 81 publishable refs while excluding both historical workbook
  paths; the resulting `main` tree is unchanged except for the removed file.
- Removed internal Codex snapshot refs that also retained the workbook tree.
- Added `.gitignore` rules for `Data/` and Excel source files.
- Added `npm run data-safety:check`, which fails when a `Data/` path or Excel
  source file is reachable in current files or Git history.
- Added the same check to the full-history CI security job.

The importer remains usable: it accepts a workbook path supplied at runtime.
Approved source data must live outside the repository in an access-controlled
location. Automated tests must generate synthetic data.

## Required remote and organizational actions

- [x] Change the GitHub repository from public to private. The 2026-07-22
  inventory found one collaborator (the owner), zero forks, zero releases, and
  no branch-protection/ruleset that would obstruct the emergency rewrite.
- [x] Review all 766 Actions artifacts. Their names are limited to gitleaks
  SARIF, Playwright reports, and E2E server logs; no workbook or database-dump
  artifact was identified.
- [ ] Force-update every remote branch and tag from the sanitized refs. A normal
  deletion commit is insufficient because the old objects remain reachable.
- [ ] Ask GitHub Support to purge cached views/objects if the repository was
  public, or if a sensitive blob remains retrievable after the force update.
- [ ] Inventory external caches, mirrors, and local clones. Owners of old clones
  must delete them and clone the sanitized history.
- [ ] Notify the responsible HR/privacy/security owner and record the exposure
  window, affected fields, audience, and notification decision.
- [ ] Rotate repository credentials only if the access review finds an
  unauthorized collaborator, compromised token, or exposed credential.

## Verification contract

Containment is complete only when all of the following are true:

1. `npm run data-safety:check` passes on a full-history clone of the remote.
2. `git log --all -- '*okok_FIXED_v2.xlsx'` returns no commit.
3. A fresh clone cannot resolve either removed blob.
4. Branch protection is restored after the force update.
5. HR/privacy/security has recorded its exposure and notification decision.

Do not delete the last controlled pre-rewrite backup until the remote update and
fresh-clone verification succeed. Store that temporary backup as sensitive data
and destroy it immediately after verification.
