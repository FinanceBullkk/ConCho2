const Class = require('../models/Class');

const teacherVisibleClassFilter = (teacherId) => ({
  $or: [
    { teacherIds: teacherId },
    { teacherIds: { $exists: false } },
    { teacherIds: { $size: 0 } },
  ],
});

const findTeacherVisibleClassIds = async (teacherId) => {
  const rows = await Class.find(teacherVisibleClassFilter(teacherId))
    .select('_id')
    .lean();
  return rows.map((row) => row._id);
};

const classScopeForActor = async (actor) => {
  if (actor?.role !== 'Teacher') return {};
  const ids = await findTeacherVisibleClassIds(actor._id);
  return { _id: { $in: ids } };
};

module.exports = {
  teacherVisibleClassFilter,
  findTeacherVisibleClassIds,
  classScopeForActor,
};
