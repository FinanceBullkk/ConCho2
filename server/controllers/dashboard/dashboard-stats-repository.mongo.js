const User = require('../../models/User');
const Class = require('../../models/Class');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Team = require('../../models/Team');

// dashboard-stats-repository — MONGO impl (Phase 3 Wave-F, extracted verbatim
// from the Phase-0 seam). The controller keeps filter-building + the PHASE-2
// in-process composition; this file owns the distinct dropdowns + the 14
// parallel aggregations/finds. `userFilter` is the controller's plain
// equality filter ({role:'Participant'} + optional exact-match dimensions).

const PARTICIPANT = { role: 'Participant' };

// Distinct filter-dropdown values (raw/unsorted — the caller sorts + shapes).
const getFilterDistincts = async () => {
  const [departments, positions, entranceLevels, currentLevels, statuses] = await Promise.all([
    User.distinct('department', { ...PARTICIPANT, department: { $ne: '' } }),
    User.distinct('position', { ...PARTICIPANT, position: { $ne: '' } }),
    User.distinct('entranceLevel', { ...PARTICIPANT, entranceLevel: { $ne: '' } }),
    User.distinct('currentLevel', { ...PARTICIPANT, currentLevel: { $ne: '' } }),
    User.distinct('status', PARTICIPANT),
  ]);
  return { departments, positions, entranceLevels, currentLevels, statuses };
};

// Ids of users matching the active filter — needed to cross-filter attendance.
const findFilteredUserIds = async (userFilter) =>
  (await User.find(userFilter).select('_id').lean()).map((u) => u._id);

// The 14 independent dashboard queries, run in parallel via allSettled so one
// slow/failed pipeline can't sink the whole dashboard. Returns the raw settled
// array in the documented order; the controller composes the response from it.
const runStatsAggregations = ({ userFilter, filteredUserIds, now, thirtyDaysAgo }) =>
  Promise.allSettled([
    // 0: User status counts (filtered)
    User.aggregate([
      { $match: userFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // 1: Attendance stats (filtered by user set)
    Attendance.aggregate([
      ...(filteredUserIds ? [{ $match: { userId: { $in: filteredUserIds } } }] : []),
      { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['P', 'L']] }, 1, 0] } } } },
    ]),
    // 2: Recently active user IDs (for at-risk calc)
    Attendance.distinct('userId', {
      createdAt: { $gte: thirtyDaysAgo },
      ...(filteredUserIds ? { userId: { $in: filteredUserIds } } : {}),
    }),
    // 3: Teams with class info
    Team.find().populate('classId', 'courseName status').select('members classId').lean(),
    // 4: All filtered participants
    User.find(userFilter).select('_id status').lean(),
    // 5: Drop reasons (filtered)
    User.aggregate([
      { $match: { ...userFilter, status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
      { $project: { reason: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 1] }, else: '$dropReason' } } } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // 6: Drop classifications (filtered)
    User.aggregate([
      { $match: { ...userFilter, status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
      { $project: { classification: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 0] }, else: '$dropReason' } } } },
      { $group: { _id: '$classification', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // 7: All classes
    Class.find().sort({ classCode: 1 }).lean(),
    // 8: Schedule counts by class — live sessions only (cancelled rows are history).
    Schedule.aggregate([
      { $match: { status: 'scheduled' } },
      { $group: { _id: '$classId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $lt: ['$endTime', now] }, 1, 0] } } } },
    ]),
    // 9: BU (department) breakdown (filtered)
    User.aggregate([
      { $match: { ...userFilter, department: { $ne: '' } } },
      { $group: { _id: { department: '$department', status: '$status' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.department', statuses: { $push: { status: '$_id.status', count: '$count' } }, total: { $sum: '$count' } } },
      { $sort: { total: -1 } },
    ]),
    // 10: Position breakdown (filtered)
    User.aggregate([
      { $match: { ...userFilter, position: { $ne: '' } } },
      { $group: { _id: { position: '$position', status: '$status' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.position', statuses: { $push: { status: '$_id.status', count: '$count' } }, total: { $sum: '$count' } } },
      { $sort: { total: -1 } },
    ]),
    // 11: Entrance Level (filtered)
    User.aggregate([
      { $match: { ...userFilter, entranceLevel: { $ne: '' } } },
      { $group: { _id: '$entranceLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // 12: Current Level (filtered)
    User.aggregate([
      { $match: { ...userFilter, currentLevel: { $ne: '' } } },
      { $group: { _id: '$currentLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // 13: Level progression (filtered)
    User.aggregate([
      { $match: { ...userFilter, entranceLevel: { $ne: '' }, currentLevel: { $ne: '' } } },
      { $project: { same: { $eq: ['$entranceLevel', '$currentLevel'] } } },
      { $group: { _id: null, total: { $sum: 1 }, progressed: { $sum: { $cond: [{ $not: '$same' }, 1, 0] } }, stayed: { $sum: { $cond: ['$same', 1, 0] } } } },
    ]),
  ]);

module.exports = { getFilterDistincts, findFilteredUserIds, runStatsAggregations };
