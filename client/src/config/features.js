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
// ──────────────────────────────────────────────────────────

export const FEATURES = {
  paths: false,        // Learning paths (multi-program sequences)
  assignments: false,  // Assigning courses to learners/groups
  assessments: false,  // Quizzes / assessments (learner + admin surfaces)
  grading: false,      // Grading workspace (quiz + rubric)
  offices: false,      // Offices / branches
  rooms: false,        // Physical rooms
  trainers: false,     // Trainer management (qualification/availability)
  branding: false,     // Branding & templates (logo, email, certificate)
  sync: false,         // Google Sheets sync
};

// True unless the key is explicitly set to false. `null`/undefined feature
// (an item with no `feature` tag) is always enabled.
export const isFeatureEnabled = (key) => key == null || FEATURES[key] !== false;
