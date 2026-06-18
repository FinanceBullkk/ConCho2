// ──────────────────────────────────────────────────────────
// Scheduling-mode classification — SINGLE SOURCE OF TRUTH
// (Converge-to-one-model, Phase 3 slice 1)
// ──────────────────────────────────────────────────────────
// A program's `schedulingMode` (on LearningProgram) splits training delivery
// into two "worlds". Before this module that split was COPIED into three places
// (scheduling-mode-policy + schedule/repository + learning/repository), each with
// a "keep these in sync" comment — schedule/repository duplicated it explicitly to
// avoid a require cycle (scheduling-mode-policy → schedule/repository).
//
// This is a ZERO-DEPENDENCY leaf module, so every layer can import the one
// canonical definition without any cycle. Behaviour is unchanged — same modes,
// same classification — this only removes the duplication.
//
//   Team modes   = leader_booking | admin_scheduled  -> booked against a Team/Group
//   Cohort modes = self_enroll    | nomination       -> booked against a Cohort (no team)
//
// A program-less class falls back to 'leader_booking' (a TEAM mode) elsewhere;
// the team world is therefore "everything that is not a cohort mode", which is why
// list reads use `$nin: cohortProgramIds` (also matching null/missing programId).

const TEAM_SCHEDULING_MODES = Object.freeze(['leader_booking', 'admin_scheduled']);
const COHORT_SCHEDULING_MODES = Object.freeze(['self_enroll', 'nomination']);
const ALL_SCHEDULING_MODES = Object.freeze([
  ...TEAM_SCHEDULING_MODES,
  ...COHORT_SCHEDULING_MODES,
]);

const isCohortMode = (mode) => COHORT_SCHEDULING_MODES.includes(mode);
const isTeamMode = (mode) => TEAM_SCHEDULING_MODES.includes(mode);

module.exports = {
  TEAM_SCHEDULING_MODES,
  COHORT_SCHEDULING_MODES,
  ALL_SCHEDULING_MODES,
  isCohortMode,
  isTeamMode,
};
