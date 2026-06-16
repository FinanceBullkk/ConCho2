---
capability: vendor-management
status: stable
owners: [domains/vendor, models/Vendor]
last_updated: 2026-06-16
related_code:
  - server/models/Vendor.js
  - server/domains/vendor/
  - server/domains/vendor/use-cases.js
  - server/domains/vendor/dto.js
  - server/models/Schedule.js
  - server/domains/finance/use-cases.js
  - server/policy/capabilities.js
  - server/scripts/backfill-vendors-from-external-trainers.js
  - client/src/features/vendor/VendorsPage.jsx
related_plans: []
---

# Capability: Vendor & External-Provider Management

> **Source of truth for BEHAVIOR.** Modernization Horizon 2 (A2). A managed
> catalog of external training providers — who they are, what they deliver, their
> contracts, post-engagement ratings, and (via A1 `CostEntry.scope.vendorId`)
> their spend. Replaces the free-text `Schedule.externalTrainer` name with a
> referenceable `Vendor`.

## Purpose

Give Training Ops one place to manage external providers instead of re-typing a
trainer name on every session: a catalog with contacts + delivered programs,
contracts that surface a renewal signal as they near expiry, ratings that
aggregate to a vendor score, and spend rolled up from the A1 cost ledger.

## Business Requirements (BR)

- **BR-1:** Admins/Coordinators create / edit / archive vendors; every mutation
  is audited; archive is a recoverable soft-delete (golden rule).
- **BR-2:** A session can reference a `Vendor` (`Schedule.vendorId`) instead of a
  free-text name; legacy `externalTrainer` data migrates into individual vendors.
- **BR-3:** Per-vendor spend rolls up from A1 cost entries (`scope.vendorId`);
  the finance cost roll-up `by=vendor` labels real vendor names.
- **BR-4:** Contract end dates drive a derived renewal signal
  (none / ok / due-soon / expired).
- **BR-5:** Post-engagement ratings aggregate to a vendor score; archiving keeps
  history on past sessions intact.
- **BR-6:** Read AND write both require `vendor.manage` (Admin + Coordinator); the
  catalog carries contracts + spend (management-sensitive), so it does NOT roll
  into the broader `report.read`.

## Actors & Use Cases (UC)

- **UC-1 (`vendor.manage`):** list / filter the vendor catalog
  (`GET /api/vendors?status=&type=&deliversProgramId=&q=`).
- **UC-2 (`vendor.manage`):** create / edit / archive a vendor.
- **UC-3 (`vendor.manage`):** view per-vendor spend
  (`GET /api/vendors/:id/spend?fiscalYear=|from=&to=`).
- **UC-4 (`vendor.manage`):** record a post-engagement rating
  (`POST /api/vendors/:id/ratings`).

## Entities

- **Vendor** (`server/models/Vendor.js`): `name`, `type`
  (`provider|individual|platform`), `contacts[{name,email,phone,role}]`,
  `delivers[LearningProgram]`, `contracts[{ref,startsOn,endsOn,valueMinor,
  currency,docUrl}]`, `ratings[{value,note,by,at}]`, `note`, `status`
  (`active|archived`), `createdBy`, soft-delete. Two independent lifecycle axes:
  `status` is the business state (archived = no longer engaged, history kept);
  `isDeleted` is the recoverable trash. Money is integer minor units with
  per-contract currency (external providers may bill in a foreign currency).
- **Schedule.vendorId** (`server/models/Schedule.js`): nullable link to the
  delivering `Vendor`; additive — the legacy `externalTrainer` subdoc is kept for
  display + calendar invites.

## Functional Requirements (FR)

### Requirement: Vendor CRUD (audited, soft-delete) [BR-1, BR-6, UC-1, UC-2]

`/api/vendors` supports list/get/create/update/archive; all require
`vendor.manage`. Archive sets `status:'archived'` AND soft-deletes (hidden from
the default catalog, recoverable). Every mutation audits (`entity:'Vendor'`).

#### Scenario: Archive hides but preserves
- **GIVEN** an active vendor
- **WHEN** it is archived (`DELETE /api/vendors/:id`)
- **THEN** the response shows `status:'archived'` and the vendor no longer
  appears in the default (active) catalog list, while its history + spend remain

### Requirement: Rating aggregate [BR-5, UC-4]

`POST /api/vendors/:id/ratings {value:1..5, note?}` appends a rating; the vendor
DTO derives `ratingAvg` (1-decimal) + `ratingCount` — never stored.

#### Scenario: Two ratings average
- **GIVEN** a vendor rated 4 then 5
- **WHEN** the vendor is read
- **THEN** it reports `ratingAvg:4.5, ratingCount:2`

### Requirement: Contract renewal signal [BR-4]

The vendor DTO derives `latestContractEndsOn` (max contract `endsOn`) and
`renewalStatus`: `none` (no contracts), `expired` (latest end < now), `due-soon`
(ends within 60 days), `ok` (beyond the window).

#### Scenario: Expiring contract flags due-soon
- **GIVEN** a vendor with a contract ending in 30 days
- **WHEN** the vendor is read
- **THEN** `renewalStatus:'due-soon'`; a contract ended 5 days ago → `'expired'`;
  one ending in 300 days → `'ok'`

### Requirement: Per-vendor spend from A1 cost entries [BR-3, UC-3]

`GET /api/vendors/:id/spend?fiscalYear=` sums `CostEntry` where
`scope.vendorId === :id` in the window, returning
`{ vendorId, totalMinor, count, currency, byType:[{type,totalMinor,count}] }`.
The finance roll-up `by=vendor` resolves real vendor names (was an id-slice
placeholder before A2).

#### Scenario: Spend rolls up + names resolve
- **GIVEN** two cost entries on a vendor (300k `vendor` + 50k `travel`) in FY2026
- **WHEN** `/api/vendors/:id/spend?fiscalYear=2026` is requested
- **THEN** `totalMinor:350000` with a per-type breakdown
- **AND** `/api/finance/costs/rollup?by=vendor&fiscalYear=2026` labels the row
  with the vendor's name

## Non-Functional Requirements (NFR)

- **Authz:** read + write = `vendor.manage` (Admin + Coordinator); all mutations audited.
- **Soft-delete:** archive never hard-deletes; history on past sessions preserved.
- **Derived, not stored:** rating aggregate, renewal status, and spend recompute
  on read.

## Acceptance Criteria (AC)

- [ ] A session can reference a Vendor (`Schedule.vendorId`); legacy
      external-trainer data migrates into individual vendors (backfill script).
- [ ] Per-vendor spend rolls up from A1 cost entries; contract end dates surface a
      renewal signal.
- [ ] Ratings aggregate to a vendor score; archiving keeps history.
- [ ] Gated behind `vendor.manage`; all mutations audited.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manage/read without `vendor.manage` | 403 | Admin/Coordinator |
| Missing `name` / unknown `type` | 400 (zod) | provide valid fields |
| Rating `value` outside 1–5 | 400 (zod) | 1–5 integer |
| Spend for an unknown vendor | 404 | valid vendor id |
| Cost entry points at a trashed vendor | roll-up labels the raw id | re-link or restore |

## Out of Scope / Deferred

- **Booking-picker vendor wiring** — `Schedule.vendorId` exists + the backfill
  links legacy sessions, but the session-create/booking UI still captures the
  free-text `externalTrainer`. Setting `vendorId` from the picker (and the
  calendar-invite path) is the immediate follow-up — kept out of this slice to
  avoid touching the booking transaction chokepoint.
- **Contract document store** — `docUrl` is a free-text link, no upload.
- **Renewal cron/email** — the renewal signal is surfaced on read (catalog
  badge), not pushed; an automated reminder is deferred (no confirmed cadence,
  mirroring the deferred report-preset cron).
- **A6 trainer qualification/availability** (Horizon 2) — `delivers` lists
  programs a vendor can teach; matching it into scheduling is A6's scope.
