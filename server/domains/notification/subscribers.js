const { subscribe } = require('../../lib/event-bus');
const EVENTS = require('../_shared/events');
const { recordInApp } = require('./in-app-writer');

// ──────────────────────────────────────────────────────────
// Notification subscribers (rearchitecture Phase 0).
//
// The in-app bell rows that used to be written INLINE inside business use-cases
// now react to domain events here — so the use-case no longer imports the
// notification layer. `recordInApp` stays fail-soft + idempotent, so a missed
// row never affects the mutation.
//
// `register()` is idempotent (guarded) so booting the app — or requiring it
// repeatedly across tests — wires the handlers exactly once.
// ──────────────────────────────────────────────────────────

let registered = false;

function register() {
  if (registered) return;
  registered = true;

  // cohort_enrolled — someone ELSE (an Admin) enrolled the learner; a self-enroll
  // is already confirmed in the UI, so we skip it. Mirrors the previous inline
  // write in domains/learning/enrollment/use-cases.js (single + bulk).
  subscribe(EVENTS.ENROLLMENT_CREATED, async ({ enrollment, cohort, actorIsSelf }) => {
    if (actorIsSelf) return;
    await recordInApp({
      type: 'cohort_enrolled',
      recipientUserId: enrollment.userId,
      cadenceKey: String(enrollment._id),
      metadata: {
        programName: cohort.courseName,
        cohortCode: cohort.classCode,
        cohortId: String(cohort._id),
      },
    });
  });
}

module.exports = { register };
