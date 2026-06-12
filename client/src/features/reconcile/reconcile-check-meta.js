import {
  CalendarX,
  ClipboardList,
  Hash,
  Link2,
  Search,
  UserMinus,
  Users,
  UserX,
} from 'lucide-react';

export const RECONCILE_CHECK_META = {
  orphaned_enrollment: {
    labelKey: 'reconcile.checks.orphanedEnrollment.label',
    descriptionKey: 'reconcile.checks.orphanedEnrollment.description',
    icon: Link2,
    severity: 'critical',
  },
  empty_future_schedule: {
    labelKey: 'reconcile.checks.emptyFutureSchedule.label',
    descriptionKey: 'reconcile.checks.emptyFutureSchedule.description',
    icon: CalendarX,
    severity: 'critical',
  },
  missing_attendance: {
    labelKey: 'reconcile.checks.missingAttendance.label',
    descriptionKey: 'reconcile.checks.missingAttendance.description',
    icon: ClipboardList,
    severity: 'warning',
  },
  ghost_member: {
    labelKey: 'reconcile.checks.ghostMember.label',
    descriptionKey: 'reconcile.checks.ghostMember.description',
    icon: UserX,
    severity: 'warning',
  },
  unattached_participant: {
    labelKey: 'reconcile.checks.unattachedParticipant.label',
    descriptionKey: 'reconcile.checks.unattachedParticipant.description',
    icon: UserMinus,
    severity: 'info',
  },
  duplicate_active_enrollment: {
    labelKey: 'reconcile.checks.duplicateActiveEnrollment.label',
    descriptionKey: 'reconcile.checks.duplicateActiveEnrollment.description',
    icon: Link2,
    severity: 'critical',
  },
  orphan_schedule_class: {
    labelKey: 'reconcile.checks.orphanScheduleClass.label',
    descriptionKey: 'reconcile.checks.orphanScheduleClass.description',
    icon: CalendarX,
    severity: 'critical',
  },
  multi_team_class: {
    labelKey: 'reconcile.checks.multiTeamClass.label',
    descriptionKey: 'reconcile.checks.multiTeamClass.description',
    icon: Users,
    severity: 'critical',
  },
  counter_drift: {
    labelKey: 'reconcile.checks.counterDrift.label',
    descriptionKey: 'reconcile.checks.counterDrift.description',
    icon: Hash,
    severity: 'warning',
  },
  soft_deleted_in_team_members: {
    labelKey: 'reconcile.checks.softDeletedTeamMember.label',
    descriptionKey: 'reconcile.checks.softDeletedTeamMember.description',
    icon: UserX,
    severity: 'warning',
  },
  // re-center Phase 3 — previously fell back to the "unknown" meta.
  orphan_room_booking: {
    labelKey: 'reconcile.checks.orphanRoomBooking.label',
    descriptionKey: 'reconcile.checks.orphanRoomBooking.description',
    icon: CalendarX,
    severity: 'critical',
  },
  // DATA-016 — waiting queue row on a past/cancelled/deleted session.
  stale_waitlist_entry: {
    labelKey: 'reconcile.checks.staleWaitlistEntry.label',
    descriptionKey: 'reconcile.checks.staleWaitlistEntry.description',
    icon: ClipboardList,
    severity: 'warning',
  },
};

const UNKNOWN_CHECK_META = {
  labelKey: 'reconcile.checks.unknown.label',
  descriptionKey: 'reconcile.checks.unknown.description',
  icon: Search,
  severity: 'info',
};

export const getReconcileCheckKeys = (report) => {
  const known = Object.keys(RECONCILE_CHECK_META);
  const reported = Object.keys(report?.summary || {}).filter((key) => key !== 'total');
  return [...new Set([...known, ...reported])];
};

export const getReconcileCheckMeta = (check) =>
  Object.hasOwn(RECONCILE_CHECK_META, check)
    ? RECONCILE_CHECK_META[check]
    : UNKNOWN_CHECK_META;
