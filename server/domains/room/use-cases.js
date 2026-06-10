const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');
const { roomDto } = require('./dto');

// ──────────────────────────────────────────────────────────
// room/use-cases — business rules for Rooms (re-center Phase 3):
// Office-scoped CRUD + the referenced-archive guard.
// ──────────────────────────────────────────────────────────

const asConflict = (error) => {
  if (error && error.code === 11000) {
    return new ServiceError('A room with this code already exists', 409);
  }
  return error;
};

// Every create/update that sets officeId must point at a LIVE office.
const assertLiveOffice = async (officeId) => {
  const office = await repository.findLiveOffice(officeId);
  if (!office) throw new ServiceError('Office not found', 404);
};

const listRooms = async (query) => {
  const rows = await repository.listRooms(query);
  return rows.map(roomDto);
};

const createRoom = async (payload) => {
  await assertLiveOffice(payload.officeId);
  try {
    const created = await repository.createRoom(payload);
    // Re-read with office populated for a consistent DTO shape.
    const populated = await repository.findRoomByIdLean(created._id);
    return roomDto(populated || created);
  } catch (error) {
    throw asConflict(error);
  }
};

const updateRoom = async (id, payload) => {
  const before = await repository.findRoomByIdLean(id);
  if (!before) throw new ServiceError('Room not found', 404);
  if (payload.officeId) await assertLiveOffice(payload.officeId);
  try {
    const after = await repository.updateRoomById(id, payload);
    return { before: roomDto(before), after: roomDto(after) };
  } catch (error) {
    throw asConflict(error);
  }
};

// Soft-delete; refuse while a FUTURE session still references the room
// (avoid orphaning a booked room — reschedule/clear the room first).
const archiveRoom = async (id) => {
  const before = await repository.findRoomByIdLean(id);
  if (!before) throw new ServiceError('Room not found', 404);
  const inUse = await repository.countFutureSessionsForRoom(id);
  if (inUse > 0) {
    throw new ServiceError(`Cannot archive: ${inUse} upcoming session(s) still use this room`, 409);
  }
  const deleted = await repository.softDeleteRoom(id);
  return { before: roomDto(before), after: roomDto(deleted) };
};

module.exports = {
  listRooms,
  createRoom,
  updateRoom,
  archiveRoom,
};
