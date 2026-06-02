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

const sessionDto = (schedule) => {
  if (!schedule) return null;
  const s = typeof schedule.toObject === 'function'
    ? schedule.toObject({ virtuals: true })
    : schedule;
  const enrolledLearners = (s.enrolledUsers || []).map(learnerDto);
  const cohort = s.classId && typeof s.classId === 'object'
    ? cohortDto(s.classId, undefined)
    : null;
  const group = s.bookedTeamId && typeof s.bookedTeamId === 'object'
    ? groupDto(s.bookedTeamId)
    : null;

  return {
    _id: s._id,
    sessionId: s._id,
    scheduleId: s._id,
    cohortId: idOf(s.classId),
    cohort,
    groupId: idOf(s.bookedTeamId),
    group,
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
