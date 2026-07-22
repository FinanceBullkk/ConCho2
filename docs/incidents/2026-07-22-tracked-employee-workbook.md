# Incident — employee training workbook tracked in Git

**Date discovered:** 2026-07-22  
**Classification:** Privacy / source-data exposure  
**Status:** Repository private; branch/tag rewrite and local containment complete; GitHub-hosted residual risk accepted by repository owner

## Summary

The application repository contained a source workbook under `Data/` with
employee identity and training-attendance fields. The file was reachable from
published Git history, including an older nested `ConCho2/Data/` path. Deleting
only the current file would not remove either historical blob.

GitHub confirmed that the application repository was public at discovery. It
was changed to private during response, so the historical exposure is assessed
under the higher-risk public-repository model.

## Local containment performed

- Inventoried every branch, remote-tracking branch, tag, and internal tree ref.
- Rebuilt all 77 branches and two tags while excluding both historical workbook
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
- [x] Atomically force-update all 79 remote branches/tags from the sanitized
  refs, guarded by leases against the pre-response remote snapshot.
- [x] Record the repository owner's 2026-07-22 decision not to ask GitHub
  Support for a server-side purge. A fresh mirror still finds 317 read-only
  `refs/pull/*/head` refs that retain the old history, and both removed blobs
  remain retrievable by object ID. Repository owners cannot update or delete
  these hidden refs themselves; this is accepted residual risk, not a completed
  technical purge.
- [ ] Inventory external caches, mirrors, and local clones. Owners of old clones
  must delete them and clone the sanitized history.
- [ ] Notify the responsible HR/privacy/security owner and record the exposure
  window, affected fields, audience, and notification decision.
- [ ] Rotate repository credentials only if the access review finds an
  unauthorized collaborator, compromised token, or exposed credential.

## Residual-risk decision

The repository must remain private. Reopening it to public access requires first
reopening this incident and completing the GitHub Support purge. Existing
external clones cannot be recalled by either the owner or GitHub and remain part
of the exposure assessment.

The full technical-purge contract below is intentionally not satisfied:

1. `npm run data-safety:check` passes on a full mirror clone of the remote,
   including GitHub-managed pull-request refs.
2. `git log --all -- '*okok_FIXED_v2.xlsx'` returns no commit.
3. A fresh clone cannot resolve either removed blob.
4. Branch protection is restored after the force update.
5. HR/privacy/security has recorded its exposure and notification decision.

The last controlled pre-rewrite backup remains sensitive and must not be shared
or copied. Its eventual destruction is a separate irreversible decision; retain
it only in an access-controlled location until the owner explicitly approves
deletion or reopens the Support-purge path.
