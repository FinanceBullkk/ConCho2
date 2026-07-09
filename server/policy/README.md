# `server/policy/` — Centralised resource authorization

This folder houses **resource-level** authorization (ownership / binding checks),
which run **after** the coarse `roleGuard()` middleware.

## Why a separate layer

`middleware/roleGuard.js` answers *"Does this role have any access to this URL?"*.
It does not answer *"Does this Teacher have access to **this specific** class?"*.
That second question lives here.

Before this layer landed, the answer was scattered:

- `evaluationController.getEvaluations` enforced Participant scope via an inline
  `if (req.user.role === 'Participant')` block; Teacher had no per-class check.
- `attendanceRoutes.js` had inline middleware on `/attendance/user/:userId` only.
- `scheduleController` did the same for Participants.

That pattern made it easy to forget a check on the next new route. The policy
module gives every resource a **single canonical home** for those decisions.

## Conventions

- Each policy file exports pure async functions:
  `canDoX(actor, targetDoc, opts) → { allowed: boolean, reason?: string }`.
- The functions take a fetched Mongoose doc (or plain object), never a
  request — they're independent of HTTP and easy to unit-test.
- Reason strings are operator-readable. The HTTP layer translates them
  into 403 responses, never echoing the internal reason to the user.

## Wiring

Routes that need a policy check use the `requirePolicy()` middleware
(`server/middleware/requirePolicy.js`):

```js
const policy = require('../policy/evaluation');

router.post('/evaluations',
  protect,
  roleGuard('Admin', 'Teacher'),
  requirePolicy(policy.canWrite, async (req) => {
    const Class = require('../models/Class');
    return Class.findById(req.body.classId).lean();
  }),
  upsertEvaluation,
);
```

For controllers that pre-fetch the target (e.g. `getEvaluationById` that
loads the doc to read its `classId`), call the policy function directly:

```js
const evaluation = await Evaluation.findById(req.params.id).lean();
const cls = evaluation && await Class.findById(evaluation.classId).lean();
const decision = await policy.canRead(req.user, cls);
if (!decision.allowed) return res.status(403).json({ success: false, message: decision.reason });
```

## Capability layer (coarse) — `capabilities.js`

`capabilities.js` + `middleware/requireCapability.js` are the **coarse** authz
layer (where `roleGuard` sat), but expressed as named capabilities instead of
roles. A route declares WHAT it needs, not WHO is allowed:

```js
const { requireCapability } = require('../../middleware/requireCapability');

router.post('/programs', protect, requireCapability('program.manage'), create);
// any-of (admin acts on others OR learner on self):
router.post('/enrollments', protect, requireCapability('enrollment.manage', 'enrollment.self'), enroll);
```

Capabilities map from the actor's role via a static table
(`ROLE_CAPABILITIES` — Admin is a superuser). This is a **scaffold**: per-user /
db-stored grants are future work. Today it's wired into `domains/learning/*`
only; legacy routes still use `roleGuard`. The role→capability sets there are
identical to the previous `roleGuard` sets, so the swap is behavior-preserving.

`requireCapability` answers "may this actor perform this kind of action at all?".
The per-resource policy functions below still answer "...on THIS doc?".

## Graceful-migration behaviour

The first policy added — teacher↔class binding — uses an "open until populated"
default: when `class.teacherIds` is empty (legacy data) the policy is
**permissive**. Admins enforce binding by populating the field on each class.
Once `teacherIds` is non-empty, only listed teachers can read/write.

This trades a known transition window (existing teachers keep working) for a
zero-downtime rollout. See `docs/audit/findings.md → AUTHZ-001` for the
rationale and the recommended `teacherIds` backfill heuristic (the one-time
`migrate-teacherIds.js` helper was removed at the Wave K safe-cleanup).
