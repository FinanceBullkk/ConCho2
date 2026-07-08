# ConCho2-backups (PRIVATE)

Daily encrypted `pg_dump` of the TMS production Neon database + automatic
restore-verify. Lives here — NOT in the public `ConCho2` repo — because
Actions artifacts on a public repo are downloadable by anyone, and these
dumps contain employee PII.

- Workflow: [`.github/workflows/pg-backup.yml`](.github/workflows/pg-backup.yml)
  (cron commented out until cutover Wave-J step 8; run manually via
  *Actions → pg-backup → Run workflow*).
- Secrets required (Settings → Secrets → Actions): `NEON_PG_URL`,
  `BACKUP_PASSPHRASE` (the passphrase MUST also live in the owner's password
  manager — losing it makes every artifact unreadable).
- Runbook, restore paths, and drills: `ConCho2/docs/backup-dr.md`.
- Retention: 30-day artifacts + a monthly offline copy on the owner's machine.
