/**
 * ──────────────────────────────────────────────────────────
 * Model → PG-row mappers (Wave G batch 2 — test-only)
 * ──────────────────────────────────────────────────────────
 * One declarative entry per Mongoose model: the migrated table + a column map
 * { snake_column: 'camelField' | (doc) => value }. Consumed by
 * pg-auto-mirror.js (upserts on every mirrored write) and pg-test-utils.js
 * (explicit fixture mirrors). NOTE: `Setting` IS mapped — the schedule
 * domain's ported repo reads ALLOWED_TIME_SLOTS from the PG `settings` table
 * (fail-closed when empty), so settings fixtures must land on both backends.
 *
 * Value normalization (see toRow): ObjectId→hex string, ObjectId[]→string[],
 * undefined→null, Date/objects pass through (pg serializes jsonb/timestamptz).
 */

const id = (v) => (v == null ? null : String(v));
const ids = (v) => (Array.isArray(v) ? v.map(id) : []);

// Base soft-delete + timestamp columns shared by most tables.
const base = {
  is_deleted: (d) => d.isDeleted ?? false,
  deleted_at: 'deletedAt',
  created_at: (d) => d.createdAt ?? new Date(),
  updated_at: (d) => d.updatedAt ?? new Date(),
};
const stamps = {
  created_at: (d) => d.createdAt ?? new Date(),
  updated_at: (d) => d.updatedAt ?? new Date(),
};

const MAPPERS = {
  User: {
    table: 'users',
    cols: {
      emp_code: 'empCode', email: 'email', name: 'name',
      department: (d) => d.department ?? '', role: 'role', status: (d) => d.status ?? 'Active',
      department_id: (d) => id(d.departmentId), manager_id: (d) => id(d.managerId),
      position: 'position', office_id: (d) => id(d.officeId),
      password: 'password', password_changed_at: 'passwordChangedAt',
      must_change_password: (d) => d.mustChangePassword ?? false,
      mfa_enabled: (d) => d.mfaEnabled ?? false, mfa_secret: 'mfaSecret',
      mfa_backup_codes: (d) => d.mfaBackupCodes ?? [], mfa_last_used_counter: 'mfaLastUsedCounter',
      failed_login_attempts: (d) => d.failedLoginAttempts ?? 0, lock_until: 'lockUntil',
      notification_preferences: 'notificationPreferences', last_active_at: 'lastActiveAt',
      entrance_level: (d) => d.entranceLevel ?? '', current_level: (d) => d.currentLevel ?? '',
      drop_reason: (d) => d.dropReason ?? '',
      ...base,
    },
  },
  Class: {
    table: 'classes',
    cols: {
      class_code: 'classCode', course_name: 'courseName', program_id: (d) => id(d.programId),
      total_sessions: 'totalSessions', status: 'status',
      teacher_ids: (d) => ids(d.teacherIds), custom_fields: 'customFields',
      ...base,
    },
  },
  Team: {
    table: 'teams',
    cols: {
      name: 'name', class_id: (d) => id(d.classId), leader_id: (d) => id(d.leaderId),
      ...base,
    },
    // members[] lives in the team_members junction — pg-auto-mirror resyncs it
    // after every team upsert (delete + reinsert, idempotent).
    junction: {
      table: 'team_members',
      sync: (d) => ({ team_id: id(d._id), user_ids: ids(d.members) }),
    },
  },
  Schedule: {
    table: 'schedules',
    cols: {
      class_id: (d) => id(d.classId), booked_team_id: (d) => id(d.bookedTeamId),
      start_time: 'startTime', end_time: 'endTime', status: 'status',
      enrolled_users: (d) => ids(d.enrolledUsers), session_instructor_ids: (d) => ids(d.sessionInstructorIds),
      room_id: (d) => id(d.roomId), office_id: (d) => id(d.officeId), topic: 'topic',
      room_link: 'roomLink', meet_link: 'meetLink', capacity: 'capacity',
      cancelled_at: 'cancelledAt', cancelled_by: (d) => id(d.cancelledBy), cancel_reason: 'cancelReason',
      ...stamps,
    },
  },
  Enrollment: {
    table: 'enrollments',
    cols: {
      user_id: (d) => id(d.userId), class_id: (d) => id(d.classId), team_id: (d) => id(d.teamId),
      status: 'status', joined_at: 'joinedAt', left_at: 'leftAt', note: 'note',
      transferred_to: (d) => id(d.transferredTo),
      ...stamps,
    },
  },
  Attendance: {
    table: 'attendances',
    cols: {
      user_id: (d) => id(d.userId), schedule_id: (d) => id(d.scheduleId), status: 'status',
      remark: 'remark', photo_url: 'photoUrl', sync_status: 'syncStatus',
      export_batch_id: 'exportBatchId', exported_at: 'exportedAt',
      ...stamps,
    },
  },
  Certificate: {
    table: 'certificates',
    cols: {
      user_id: (d) => id(d.userId), program_id: (d) => id(d.programId), status: 'status',
      issued_at: 'issuedAt', certificate_number: 'certificateNumber',
      verification_code: 'verificationCode', cohort_id: (d) => id(d.cohortId),
      learner_name: 'learnerName', program_name: 'programName', cohort_code: 'cohortCode',
      completion_snapshot: 'completionSnapshot', issued_by: (d) => id(d.issuedBy),
      valid_from: 'validFrom', valid_until: 'validUntil', validity_days: 'validityDays',
      revoked_at: 'revokedAt', revoked_reason: 'revokedReason',
      ...base,
    },
  },
  LearningProgram: {
    table: 'learning_programs',
    cols: {
      name: 'name', code: 'code', description: 'description', category: 'category',
      default_session_count: 'defaultSessionCount', scheduling_mode: 'schedulingMode',
      delivery_mode: 'deliveryMode', status: 'status',
      certificate_validity_days: 'certificateValidityDays', legacy_course_name: 'legacyCourseName',
      completion_policy: 'completionPolicy', capacity_policy: 'capacityPolicy',
      facilitator_policy: 'facilitatorPolicy', recertify_policy: 'recertifyPolicy',
      custom_fields: 'customFields', prerequisite_programs: (d) => ids(d.prerequisitePrograms),
      ...base,
    },
  },
  Setting: {
    table: 'settings',
    cols: {
      key: 'key',
      // Mixed value → jsonb: stringify so pg treats arrays as ONE json value,
      // not a text[] literal (node-postgres array-serializes bare JS arrays).
      value: (d) => (d.value === undefined ? null : JSON.stringify(d.value)),
      description: 'description',
      ...stamps,
    },
  },
  MetricSnapshot: {
    table: 'metric_snapshots',
    cols: {
      date: 'date', scope: 'scope', scope_id: (d) => id(d.scopeId), key: 'key', value: 'value',
      created_at: (d) => d.createdAt ?? new Date(),
    },
  },
  Department: {
    table: 'departments',
    cols: { name: 'name', code: 'code', description: 'description', ...base },
  },
  Office: {
    table: 'offices',
    cols: { name: 'name', code: 'code', address: 'address', timezone: 'timezone', ...base },
  },
  NotificationLog: {
    table: 'notification_logs',
    cols: {
      type: 'type', channel: 'channel', recipient_email: 'recipientEmail',
      recipient_user_id: (d) => id(d.recipientUserId), assignment_id: (d) => id(d.assignmentId),
      learner_id: (d) => id(d.learnerId), cadence_key: 'cadenceKey', status: 'status',
      sent_at: 'sentAt', read_at: 'readAt', error: 'error', metadata: 'metadata',
      ...stamps,
    },
  },
  Evaluation: {
    table: 'evaluations',
    cols: {
      class_id: (d) => id(d.classId), user_id: (d) => id(d.userId), level: 'level',
      grammar_score: 'grammarScore', vocabulary_score: 'vocabularyScore',
      pronunciation_score: 'pronunciationScore', fluency_score: 'fluencyScore',
      teacher_comment: 'teacherComment', created_by: (d) => id(d.createdBy),
      ...base,
    },
  },
  // Assessment engine (converge Phase 1) — the ported assessment domain reads
  // these from PG, so quiz fixtures must mirror. `items`/`answers` are jsonb
  // ARRAYS → stringify (node-pg would otherwise emit a text[] literal).
  Assessment: {
    table: 'assessments',
    cols: {
      title: 'title', description: 'description', cohort_id: (d) => id(d.cohortId),
      program_id: (d) => id(d.programId),
      items: (d) => (d.items == null ? null : JSON.stringify(d.items)),
      passing_score_percent: 'passingScorePercent', max_attempts: 'maxAttempts',
      time_limit_minutes: 'timeLimitMinutes', shuffle_questions: 'shuffleQuestions',
      show_answers_after: 'showAnswersAfter', is_published: 'isPublished',
      created_by: (d) => id(d.createdBy),
      ...base,
    },
  },
  AssessmentAttempt: {
    table: 'assessment_attempts',
    cols: {
      assessment_id: (d) => id(d.assessmentId), user_id: (d) => id(d.userId),
      cohort_id: (d) => id(d.cohortId),
      answers: (d) => (d.answers == null ? null : JSON.stringify(d.answers)),
      score: 'score', max_score: 'maxScore', score_percent: 'scorePercent',
      passed: 'passed', submitted_at: 'submittedAt',
      ...base,
    },
  },
  Assignment: {
    table: 'assignments',
    cols: {
      title: 'title', description: 'description', target_type: 'targetType',
      program_id: (d) => id(d.programId), path_id: (d) => id(d.pathId),
      due_date: 'dueDate', user_ids: (d) => ids(d.userIds), department_ids: (d) => ids(d.departmentIds),
      status: 'status', created_by: (d) => id(d.createdBy),
      source_certificate_id: (d) => id(d.sourceCertificateId),
      ...base,
    },
  },
  Feedback: {
    table: 'feedbacks',
    cols: {
      cohort_id: (d) => id(d.cohortId), user_id: (d) => id(d.userId),
      program_id: (d) => id(d.programId), rating: 'rating',
      content_rating: 'contentRating', instructor_rating: 'instructorRating',
      comment: 'comment', submitted_by: (d) => id(d.submittedBy),
      ...base,
    },
  },
  AuditLog: {
    table: 'audit_log',
    cols: {
      actor_id: (d) => id(d.actorId), actor_role: 'actorRole', actor_emp_code: 'actorEmpCode',
      action: 'action', entity: 'entity', entity_id: (d) => id(d.entityId), diff: 'diff',
      request_id: 'requestId', ip: 'ip', user_agent: 'userAgent', note: 'note',
      seq: 'seq', prev_hash: 'prevHash', hash: 'hash',
      created_at: (d) => d.createdAt ?? new Date(),
    },
  },
};

/** Build the full PG row (including id) for a mapped model's doc/POJO. */
const toRow = (modelName, d) => {
  const m = MAPPERS[modelName];
  if (!m) return null;
  const row = { id: id(d._id) };
  for (const [col, spec] of Object.entries(m.cols)) {
    const v = typeof spec === 'function' ? spec(d) : d[spec];
    row[col] = v === undefined ? null : v;
  }
  return row;
};

module.exports = { MAPPERS, toRow };
