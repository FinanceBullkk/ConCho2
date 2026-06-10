const { cohortDto } = require('../dto');

const idOf = (value) => value?._id || value || null;

const groupDto = (group) => {
  if (!group || typeof group !== 'object') return null;
  return {
    _id: group._id,
    name: group.name,
    leaderId: idOf(group.leaderId),
    cohortId: idOf(group.classId),
  };
};

const officeDto = (office) => {
  if (!office || typeof office !== 'object') return null;
  return { _id: office._id, name: office.name, code: office.code };
};

const roomDto = (room) => {
  if (!room || typeof room !== 'object') return null;
  return { _id: room._id, name: room.name, code: room.code };
};

// Internal trainer (Phase 3) — name + empCode only, NEVER email (Wave E3 F4).
const internalTrainerDto = (user) => {
  if (!user || typeof user !== 'object') return { _id: user };
  return { _id: user._id, empCode: user.empCode, name: user.name };
};

// External trainer (Phase 3, DELTA B): a scheduler (Admin/Coordinator) sees the
// full contact; a learner sees only name + org (NF3 — no email/phone leak).
const externalTrainerDto = (ext, canSeeContact) => {
  if (!ext || typeof ext !== 'object') return null;
  if (canSeeContact) {
    return { name: ext.name, email: ext.email || null, phone: ext.phone || null, org: ext.org || null };
  }
  return { name: ext.name, org: ext.org || null };
};

const learnerDto = (learner) => {
  if (!learner || typeof learner !== 'object') return { _id: learner };
  return {
    _id: learner._id,
    learnerId: learner._id,
    empCode: learner.empCode,
    name: learner.name,
    department: learner.department,
    status: learner.status,
  };
};

const sessionDto = (schedule, viewer = null) => {
  if (!schedule) return null;
  const s = typeof schedule.toObject === 'function'
    ? schedule.toObject({ virtuals: true })
    : schedule;
  const canSeeContact = Boolean(viewer) && ['Admin', 'Coordinator'].includes(viewer.role);
  const enrolledLearners = (s.enrolledUsers || []).map(learnerDto);
  const cohort = s.classId && typeof s.classId === 'object'
    ? cohortDto(s.classId, undefined)
    : null;
  const group = s.bookedTeamId && typeof s.bookedTeamId === 'object'
    ? groupDto(s.bookedTeamId)
    : null;
  const office = s.officeId && typeof s.officeId === 'object'
    ? officeDto(s.officeId)
    : null;
  const room = s.roomId && typeof s.roomId === 'object'
    ? roomDto(s.roomId)
    : null;
  const sessionInstructors = (s.sessionInstructorIds || [])
    .map(internalTrainerDto)
    .filter((t) => t && t._id);
  const externalTrainer = externalTrainerDto(s.externalTrainer, canSeeContact);

  return {
    _id: s._id,
    sessionId: s._id,
    scheduleId: s._id,
    // Durable cancellation (phase-04 slice A). Learner/Teacher list filters
    // exclude cancelled rows server-side; schedulers see them with this state.
    status: s.status || 'scheduled',
    cancelledAt: s.cancelledAt || null,
    cancelReason: s.cancelReason || '',
    cohortId: idOf(s.classId),
    cohort,
    groupId: idOf(s.bookedTeamId),
    group,
    officeId: idOf(s.officeId),
    office,
    roomId: idOf(s.roomId),
    room,
    sessionInstructors,
    externalTrainer,
    startTime: s.startTime,
    endTime: s.endTime,
    roomLink: s.roomLink || '',
    meetLink: s.meetLink || '',
    capacity: s.capacity,
    sessionNumber: s.sessionNumber || null,
    enrolledLearners,
    enrolledLearnerCount: enrolledLearners.length,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
};

module.exports = { sessionDto };
