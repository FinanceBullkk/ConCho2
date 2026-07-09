const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// groups/read-repository — POSTGRES impl
// ──────────────────────────────────────────────────────────
// Same interface as ./read-repository.mongo. Pure reads (no tx handle — the
// mutation callers run these OUTSIDE the write transaction, e.g. the post-write
// populated re-read). Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • Team pre-find soft-delete hooks → explicit `is_deleted = false`
//     predicates on every default read (incl. countTeams — countDocuments IS
//     in the Team SOFT_DELETE_HOOKS list); findDeletedTeams queries
//     is_deleted = true explicitly (the hook-bypass trash view).
//   • populate('classId'/'leaderId'/'members', <select>) → batch embed with
//     ONLY the selected fields; Class/User carry soft-delete find-hooks, so a
//     soft-deleted (or missing) single ref embeds as null and a soft-deleted
//     member DROPS out of the array (Mongoose array-populate removes misses).
//   • nested populate classId.programId ('schedulingMode'): LearningProgram
//     has NO soft-delete find-hook, so the nested embed does NOT filter
//     is_deleted — only a missing row nulls out.
//   • non-lean Mongo reads return hydrated docs that res.json serialises via
//     toJSON (Team has no virtuals/transform) — the PG twin returns the
//     lean-equivalent plain objects with `_id` as string, same JSON output.
//   • members ORDER: team_members has NO ordinal column (PK team_id,user_id),
//     so the Mongo members-array order is not persisted in PG. Reads return
//     members in ascending user_id; callers treat membership as a set (see
//     team-write-repository — "order-independent, compared as a set").
//   • schedules/attendances rows map to the canonical lean doc shapes (the
//     schedule mapper mirrors domains/schedule/repository.pg baseSchedule).
// ──────────────────────────────────────────────────────────

const ids = (a) => (a || []).map(String);

// ── membership (team_members junction) ────────────────────
// Raw member ids per team, ascending user_id (see ORDER note above).
const memberIdsByTeam = async (teamIds) => {
  const map = new Map();
  if (!teamIds.length) return map;
  const { rows } = await query(
    `SELECT team_id, user_id FROM team_members WHERE team_id = ANY($1) ORDER BY user_id ASC`,
    [teamIds],
  );
  for (const r of rows) {
    if (!map.has(r.team_id)) map.set(r.team_id, []);
    map.get(r.team_id).push(r.user_id);
  }
  return map;
};

// ── batch ref embeds (soft-delete-aware, drop-to-null) ────
const USER_COLS = { empCode: 'emp_code', name: 'name', department: 'department', status: 'status' };
const fetchUsers = async (idList, fields) => {
  const uniq = [...new Set(ids(idList).filter(Boolean))];
  if (!uniq.length) return new Map();
  const cols = ['id', ...fields.map((f) => USER_COLS[f])].join(', ');
  const { rows } = await query(`SELECT ${cols} FROM users WHERE id = ANY($1) AND is_deleted = false`, [uniq]);
  return new Map(rows.map((r) => {
    const o = { _id: r.id };
    for (const f of fields) o[f] = r[USER_COLS[f]];
    return [r.id, o];
  }));
};

const CLASS_COLS = { classCode: 'class_code', courseName: 'course_name', status: 'status', programId: 'program_id' };
const fetchClasses = async (idList, fields, nestedProgram = false) => {
  const uniq = [...new Set(ids(idList).filter(Boolean))];
  if (!uniq.length) return new Map();
  const cols = ['id', ...fields.map((f) => CLASS_COLS[f])].join(', ');
  const { rows } = await query(`SELECT ${cols} FROM classes WHERE id = ANY($1) AND is_deleted = false`, [uniq]);
  const map = new Map(rows.map((r) => {
    const o = { _id: r.id };
    for (const f of fields) o[f] = r[CLASS_COLS[f]];
    return [r.id, o];
  }));
  if (nestedProgram) {
    // NO is_deleted predicate — LearningProgram has no soft-delete hook (see header).
    const pids = [...new Set([...map.values()].map((c) => c.programId).filter(Boolean))];
    const progs = pids.length
      ? (await query(`SELECT id, scheduling_mode FROM learning_programs WHERE id = ANY($1)`, [pids])).rows
      : [];
    const pmap = new Map(progs.map((p) => [p.id, { _id: p.id, schedulingMode: p.scheduling_mode }]));
    for (const c of map.values()) c.programId = (c.programId && pmap.get(c.programId)) || null;
  }
  return map;
};

// Full team row → lean-doc shape (refs stay raw ids; populateTeams overrides).
const teamRow = (r) => ({
  ...(r.meta || {}), // ETL extras — core columns override below
  _id: r.id,
  name: r.name,
  classId: r.class_id || null,
  leaderId: r.leader_id || null,
  members: [], // filled by populateTeams
  isDeleted: r.is_deleted,
  deletedAt: r.deleted_at || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Attach membership + the requested populates to a batch of team rows.
// A select of `null` keeps that path RAW (no populate): members = junction ids,
// classId/leaderId = stored id (or null) — mirrors which paths each Mongo read
// actually populates.
const populateTeams = async (rows, {
  memberSelect = ['empCode', 'name', 'department', 'status'],
  leaderSelect = ['empCode', 'name', 'department', 'status'],
  classSelect = ['classCode', 'courseName', 'status'],
  nestedProgram = false,
} = {}) => {
  if (!rows.length) return [];
  const membersMap = await memberIdsByTeam(rows.map((r) => r.id));
  const allMemberIds = [...membersMap.values()].flat();
  const [memberMap, leaderMap, classMap] = await Promise.all([
    memberSelect ? fetchUsers(allMemberIds, memberSelect) : null,
    leaderSelect ? fetchUsers(rows.map((r) => r.leader_id), leaderSelect) : null,
    classSelect ? fetchClasses(rows.map((r) => r.class_id), classSelect, nestedProgram) : null,
  ]);
  return rows.map((r) => {
    const t = teamRow(r);
    const rawMembers = membersMap.get(r.id) || [];
    t.members = memberSelect
      ? rawMembers.map((id) => memberMap.get(id)).filter(Boolean) // array-populate drops misses
      : rawMembers;
    if (leaderSelect) t.leaderId = (r.leader_id && leaderMap.get(r.leader_id)) || null;
    if (classSelect) t.classId = (r.class_id && classMap.get(r.class_id)) || null;
    return t;
  });
};

// ── Team list reads (queries.getTeams) ────────────────────
// `slim` skips the members USER populate (API-002) — members stay raw ids,
// exactly like the un-populated Mongo array (incl. soft-deleted member ids).
const TEAM_LIST_SQL = `SELECT * FROM teams WHERE is_deleted = false ORDER BY name ASC`;

const findTeamsPage = async ({ slim, skip, limit }) => {
  const { rows } = await query(`${TEAM_LIST_SQL} OFFSET $1 LIMIT $2`, [skip, limit]);
  return populateTeams(rows, { memberSelect: slim ? null : undefined });
};

const findAllTeams = async ({ slim }) => {
  const { rows } = await query(TEAM_LIST_SQL);
  return populateTeams(rows, { memberSelect: slim ? null : undefined });
};

const countTeams = async () => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM teams WHERE is_deleted = false`);
  return rows[0].n;
};

// ── Single-team reads ─────────────────────────────────────

// Full populate — shared by getTeamById and the post-write reads in mutations.
const findTeamByIdPopulated = async (id) => {
  const { rows } = await query(`SELECT * FROM teams WHERE id = $1 AND is_deleted = false`, [String(id)]);
  if (!rows[0]) return null;
  const [team] = await populateTeams(rows);
  return team;
};

// getMyTeams — nested program.schedulingMode for client-side cell gating.
const findTeamsForUser = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM teams t
      WHERE t.is_deleted = false
        AND (t.leader_id = $1
             OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1))
      ORDER BY t.name ASC`,
    [String(userId)],
  );
  return populateTeams(rows, {
    classSelect: ['classCode', 'courseName', 'status', 'programId'],
    nestedProgram: true,
  });
};

// Trash view — explicit is_deleted = true (the Mongo hook-bypass read).
// NULLS LAST matches Mongo desc ordering (dates sort before null in desc).
const findDeletedTeams = async () => {
  const { rows } = await query(`SELECT * FROM teams WHERE is_deleted = true ORDER BY deleted_at DESC NULLS LAST`);
  return populateTeams(rows, {
    memberSelect: null, // members stay raw ids (not populated on this read)
    leaderSelect: ['empCode', 'name'],
    classSelect: ['classCode', 'courseName'],
  });
};

// getTeamProgress — team + its live sessions + their attendance rows.
const findTeamForProgress = async (teamId) => {
  const { rows } = await query(`SELECT * FROM teams WHERE id = $1 AND is_deleted = false`, [String(teamId)]);
  if (!rows[0]) return null;
  const [team] = await populateTeams(rows, {
    leaderSelect: null, // leaderId stays a raw id (not populated on this read)
    classSelect: ['classCode', 'courseName'],
  });
  return team;
};

// Schedule row → canonical lean shape (mirrors schedule/repository.pg baseSchedule
// — extras like externalTrainer/vendorId ride in meta and spread back on top).
const scheduleRow = (r) => ({
  ...(r.meta || {}),
  _id: r.id,
  classId: r.class_id || null,
  bookedTeamId: r.booked_team_id || null,
  officeId: r.office_id || null,
  startTime: r.start_time,
  endTime: r.end_time,
  roomLink: r.room_link == null ? '' : r.room_link,
  roomId: r.room_id || null,
  sessionInstructorIds: ids(r.session_instructor_ids),
  topic: r.topic == null ? '' : r.topic,
  meetLink: r.meet_link == null ? '' : r.meet_link,
  enrolledUsers: ids(r.enrolled_users),
  capacity: r.capacity == null ? undefined : Number(r.capacity),
  status: r.status,
  cancelledAt: r.cancelled_at || null,
  cancelledBy: r.cancelled_by || null,
  cancelReason: r.cancel_reason == null ? '' : r.cancel_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const findTeamScheduledSessions = async (teamId) => {
  const { rows } = await query(
    `SELECT * FROM schedules WHERE booked_team_id = $1 AND status = 'scheduled' ORDER BY start_time ASC`,
    [String(teamId)],
  );
  return rows.map(scheduleRow);
};

// ── getUserProgress support (K1b slice 4) ─────────────────
// Live teams the user is a member of, class label embedded (members/leader stay
// raw — the caller only reads _id/name/classId). Mongo has no sort here; ORDER BY
// id makes the PG read deterministic (the parity test sorts both sides anyway).
const findMemberTeamsWithClass = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM teams t
      WHERE t.is_deleted = false
        AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1)
      ORDER BY t.id ASC`,
    [String(userId)],
  );
  return populateTeams(rows, { memberSelect: null, leaderSelect: null, classSelect: ['classCode', 'courseName'] });
};

// bookedTeamId → {_id,name}, soft-delete-aware (a trashed team populates null).
const fetchTeamNames = async (idList) => {
  const uniq = [...new Set(ids(idList).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { rows } = await query(`SELECT id, name FROM teams WHERE id = ANY($1) AND is_deleted = false`, [uniq]);
  return new Map(rows.map((r) => [r.id, { _id: r.id, name: r.name }]));
};

// The teams' live sessions, populated (classId label + bookedTeamId name) like
// the progress response embeds them; start_time asc, id tiebreak for determinism.
const findScheduledByBookedTeamIdsPopulated = async (teamIds) => {
  const tids = ids(teamIds);
  if (!tids.length) return []; // $in:[] matches nothing
  const { rows } = await query(
    `SELECT * FROM schedules WHERE booked_team_id = ANY($1) AND status = 'scheduled' ORDER BY start_time ASC, id ASC`,
    [tids],
  );
  const [classMap, teamMap] = await Promise.all([
    fetchClasses(rows.map((r) => r.class_id), ['classCode', 'courseName']),
    fetchTeamNames(rows.map((r) => r.booked_team_id)),
  ]);
  return rows.map((r) => {
    const s = scheduleRow(r);
    s.classId = (r.class_id && classMap.get(r.class_id)) || null;
    s.bookedTeamId = (r.booked_team_id && teamMap.get(r.booked_team_id)) || null;
    return s;
  });
};

// Attendance row → lean shape (no populate on this read; export stamps are
// undefined-when-null so JSON drops them, like the absent Mongo paths).
const attendanceRow = (a) => ({
  ...(a.meta || {}),
  _id: a.id,
  userId: a.user_id,
  scheduleId: a.schedule_id,
  status: a.status,
  remark: a.remark == null ? '' : a.remark,
  photoUrl: a.photo_url == null ? '' : a.photo_url,
  syncStatus: a.sync_status,
  exportBatchId: a.export_batch_id == null ? undefined : a.export_batch_id,
  exportedAt: a.exported_at == null ? undefined : a.exported_at,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

const findAttendanceForSchedules = async (scheduleIds) => {
  const sids = ids(scheduleIds);
  if (!sids.length) return []; // $in:[] matches nothing
  const { rows } = await query(`SELECT * FROM attendances WHERE schedule_id = ANY($1)`, [sids]);
  return rows.map(attendanceRow);
};

// ── Mutations: pre-write reads + conflict guards ──────────

const findTeamByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM teams WHERE id = $1 AND is_deleted = false`, [String(id)]);
  if (!rows[0]) return null;
  const members = await memberIdsByTeam([rows[0].id]);
  return { ...teamRow(rows[0]), members: members.get(rows[0].id) || [] };
};

// "1 team per class" guard — the team currently holding a class (if any).
// Mongo findOne returns the natural-order (≈ insertion-order) first match;
// created_at ASC + id tiebreak is the deterministic SQL analogue.
const findTeamByClass = async (classId, excludeId = null) => {
  const args = [String(classId)];
  let excl = '';
  if (excludeId) { args.push(String(excludeId)); excl = 'AND id <> $2'; }
  const { rows } = await query(
    `SELECT * FROM teams WHERE class_id = $1 AND is_deleted = false ${excl}
      ORDER BY created_at ASC, id ASC LIMIT 1`,
    args,
  );
  if (!rows[0]) return null;
  const [team] = await populateTeams(rows, {
    memberSelect: null, leaderSelect: null, classSelect: ['classCode'],
  });
  return team;
};

const findTeamByClassExcluding = (classId, excludeId) => findTeamByClass(classId, excludeId);

// "1 team per member" guard — teams that already hold any of the members.
// id ASC keeps the conflict list deterministic (Mongo natural ≈ insertion order).
const findTeamsByMembers = async (memberIds, excludeTeamId = null) => {
  const mids = ids(memberIds);
  if (!mids.length) return []; // $in:[] matches nothing
  const args = [mids];
  let excl = '';
  if (excludeTeamId) { args.push(String(excludeTeamId)); excl = 'AND t.id <> $2'; }
  const { rows } = await query(
    `SELECT * FROM teams t
      WHERE t.is_deleted = false ${excl}
        AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = ANY($1))
      ORDER BY t.id ASC`,
    args,
  );
  return populateTeams(rows, {
    memberSelect: ['name', 'empCode'], leaderSelect: null, classSelect: null,
  });
};

module.exports = {
  // list reads
  findTeamsPage,
  findAllTeams,
  countTeams,
  // single reads
  findTeamByIdPopulated,
  findTeamsForUser,
  findDeletedTeams,
  findTeamForProgress,
  findTeamScheduledSessions,
  findAttendanceForSchedules,
  // mutation pre-reads / guards
  findTeamByIdLean,
  findTeamByClass,
  findTeamByClassExcluding,
  findTeamsByMembers,
  // getUserProgress support
  findMemberTeamsWithClass,
  findScheduledByBookedTeamIdsPopulated,
};
