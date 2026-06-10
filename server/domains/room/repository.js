const Room = require('../../models/Room');
const Office = require('../../models/Office');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// room/repository — all Mongoose access for Rooms
// (re-center Phase 3). Rooms are Office-scoped (DELTA A).
// ──────────────────────────────────────────────────────────

const createRoom = (data) => Room.create(data);

const findRoomByIdLean = (id) =>
  Room.findOne({ _id: id, isDeleted: false }).populate('officeId', 'name code').lean();

// List rooms, optionally scoped to one Office (picker) + text search.
const listRooms = ({ officeId, search } = {}) => {
  const filter = { isDeleted: false };
  if (officeId) filter.officeId = officeId;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  return Room.find(filter).populate('officeId', 'name code').sort({ name: 1 }).lean();
};

const updateRoomById = (id, data) =>
  Room.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).populate('officeId', 'name code').lean();

const softDeleteRoom = (id) =>
  Room.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// Live Office lookup — Room CRUD validates the target Office exists + is live.
const findLiveOffice = (officeId) => Office.findOne({ _id: officeId, isDeleted: false }).select('_id').lean();

// How many FUTURE sessions still reference this room (blocks archive).
const countFutureSessionsForRoom = (roomId) =>
  Schedule.countDocuments({ roomId, startTime: { $gt: new Date() } });

module.exports = {
  createRoom,
  findRoomByIdLean,
  listRooms,
  updateRoomById,
  softDeleteRoom,
  findLiveOffice,
  countFutureSessionsForRoom,
};
