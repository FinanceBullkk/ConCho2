# Soft-delete query discipline (DATA-009)

## Status
Accepted · enforced by `server/tests/unit/soft-delete-lookup-guard.test.js`.

## Context
Soft-deletable models (`isDeleted` + `deletedAt`) rely on Mongoose hooks
`pre('find')` / `pre('aggregate')` to auto-inject `isDeleted: { $ne: true }` so
deleted rows never surface. **Those hooks do NOT fire inside a `$lookup`
sub-pipeline.** A plain `$lookup` into a soft-deletable collection therefore
silently re-admits deleted rows — e.g. a soft-deleted Class label leaking into
the HR evaluation export (bug fixed in PR #180).

Soft-deletable collections (models with a soft-delete `pre('aggregate')` hook):
`users`, `classes`, `teams`, `evaluations`, `costentries`, `trainingrequests`.

## Decision
Every `$lookup` into a soft-deletable collection MUST use the **pipeline form**
with an explicit `isDeleted` guard at the join:

```js
{
  $lookup: {
    from: 'classes',
    let: { cid: '$classId' },
    pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$cid'] }, isDeleted: { $ne: true } } }],
    as: 'class',
  },
},
{ $unwind: { path: '$class', preserveNullAndEmptyArrays: true } }
```

Use `preserveNullAndEmptyArrays: true` on the `$unwind` when the joined label is
optional, so a soft-deleted/missing parent never DROPS a real child record — the
row stays, just without the stale label.

The guard test scans `domains/`, `controllers/`, `services/`, `models/`, `jobs/`
and fails CI if any `$lookup` into a soft-deletable collection omits `isDeleted`.

## Forward note (PostgreSQL migration)
SQL has no hook layer — the soft-delete predicate must be explicit in **every**
query (or a `WHERE is_deleted = false` view per table). This guard doubles as the
enforced inventory of joins whose predicate must be carried over at port time
(see `plans/260612-2042-postgresql-migration/phase-00-readiness-hardening.md`
WS-B).

## Unresolved questions
- Per-table SQL **view** vs inline `WHERE` for the predicate — decide in
  migration Phase 1 with prototype evidence.
