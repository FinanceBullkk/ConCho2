// ──────────────────────────────────────────────────────────
// Feature toggles — hide modules this deployment doesn't use.
// ──────────────────────────────────────────────────────────
// Flip a key to `false` to HIDE that module from the navigation. Hiding is
// UX-only: the routes + APIs still exist (a direct URL still works); this just
// removes the sidebar entry so the app shows only what you use.
//
// A key that is absent or `true` ⇒ shown. Nav items opt in via a `feature`
// tag in nav-config.js; `isItemVisible` consults `isFeatureEnabled` first.
//
// To re-enable a module later: set it back to `true` (or delete the line).
//
// ── Scope trim (2026-07-09) ──────────────────────────────────
// The app is an INTERNAL LTMS for ~1000 employees. The sidebar was trimmed to
// the core operating loop only:
//     schedule → attendance → assessment → completion → certificate → report
// Speculative modules (built ahead of a confirmed HR/L&D need — Horizon 1/2 /
// TMS.update) are HIDDEN, not deleted, so any one can be switched back on the
// day HR actually asks for it. Delete them for real only after they stay dark
// and unrequested through real HR usage.
// ──────────────────────────────────────────────────────────

export const FEATURES = {
  // ── Core loop — SHOWN ─────────────────────────────────────
  assessments: true,   // Quizzes / tests after a course (learner + admin)
  grading: true,       // Grading workspace (quiz manual grading + rubric)
  assignments: true,   // Assign mandatory courses to people/groups + due date
  rooms: true,         // Physical rooms (needed to book a session into a room)

  // ── Hidden — speculative, no confirmed HR/L&D need yet ─────
  // (flip any to `true` to bring it back into the sidebar instantly)
  paths: false,            // Multi-program learning paths / curriculum sequences
  offices: false,          // Offices / branches under the org tree
  skills: false,           // Skills / competency framework
  trainers: false,         // Trainer qualification / availability management
  vendors: false,          // External training vendor catalog + contracts
  planning: false,         // Training Needs Analysis → costed annual plan
  budget: false,           // Training budgets
  costRoi: false,          // Cost & ROI tracking
  automation: false,       // No-code when/if/then automation rules
  customFields: false,     // Custom field definitions (Studio)
  access: false,           // Custom roles / RBAC grant editor
  branding: false,         // Branding & certificate/email templates
  schedulingConfig: false, // Scheduling-mode / time-slot studio config
  sync: false,             // Google Sheets sync
};

// True unless the key is explicitly set to false. `null`/undefined feature
// (an item with no `feature` tag) is always enabled.
export const isFeatureEnabled = (key) => key == null || FEATURES[key] !== false;
