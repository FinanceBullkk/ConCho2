const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// room/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Office-scoped Room CRUD over the offices/rooms tables (migration 003).
//
// Fidelity to the Mongoose model that the parity test pins:
//   • setters: name trimmed, code trimmed + UPPERCASE (Room schema).
//   • soft-delete: explicit `is_deleted = false` predicates (no pre('find')
//     hook in SQL); isDeleted/deletedAt are select:false on the model so the
//     returned shapes omit them (a soft-deleted row is observed by a follow-up
//     read returning null, not by reading the flag back).
//   • populate('officeId','name code') → LEFT JOIN offices … AND is_deleted=false,
//     so a soft-deleted office surfaces as officeId:null (DATA-009 discipline),
//     exactly like Mongoose populate (which applies the Office soft-delete hook).
// ──────────────────────────────────────────────────────────

// ObjectId-shaped id for new rows (24 hex) — uniform with migrated Mongo ids.
const newId = () => crypto.randomBytes(12).toString('hex');

// The live-code unique violation (uq_rooms_code_active, 23505) → a Mongo-style
// { code: 11000 } so the use-case's asConflict maps it to 409 on either backend
// (same precedent as office/department/path repos).
const duplicateError = () => {
  const e = new Error('duplicate room code');
  e.code = 11000;
  return e;
};

// Map a room row (+ optionally joined office cols) to the Mongoose-lean shape.
const roomRow = (r, { populated = true } = {}) => {
  const room = {
    _id: r.id,
    name: r.name,
    code: r.code,
    seats: r.seats == null ? null : Number(r.seats),
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  room.officeId = populated
    ? (r.office_name != null ? { _id: r.office_id, name: r.office_name, code: r.office_code } : null)
    : (r.office_id || null);
  return room;
};

const createRoom = async (data) => {
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO rooms(id,name,code,office_id,seats,is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        newId(),
        String(data.name).trim(),
        String(data.code).trim().toUpperCase(),
        data.officeId,
        data.seats == null ? null : data.seats,
        data.isActive == null ? true : data.isActive,
      ],
    ));
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
  return roomRow(rows[0], { populated: false }); // Room.create returns un-populated officeId
};

const findRoomByIdLean = async (id) => {
  const { rows } = await query(
    `SELECT r.*, o.name AS office_name, o.code AS office_code
       FROM rooms r
       LEFT JOIN offices o ON o.id = r.office_id AND o.is_deleted = false
      WHERE r.id = $1 AND r.is_deleted = false`,
    [id],
  );
  return rows[0] ? roomRow(rows[0]) : null;
};

// Literal-substring search (Mongo escapes regex metachars → literal); escape the
// SQL LIKE wildcards %,_,\ so the ILIKE match is literal too.
const escapeLike = (s) => s.replace(/([%_\\])/g, '\\$1');

const listRooms = async ({ officeId, search } = {}) => {
  const conds = ['r.is_deleted = false'];
  const args = [];
  if (officeId) { args.push(officeId); conds.push(`r.office_id = $${args.length}`); }
  if (search) {
    args.push(`%${escapeLike(search)}%`);
    conds.push(`(r.name ILIKE $${args.length} OR r.code ILIKE $${args.length})`);
  }
  const { rows } = await query(
    `SELECT r.*, o.name AS office_name, o.code AS office_code
       FROM rooms r
       LEFT JOIN offices o ON o.id = r.office_id AND o.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY r.name ASC`,
    args,
  );
  return rows.map((r) => roomRow(r));
};

const FIELD_COL = { name: 'name', code: 'code', officeId: 'office_id', seats: 'seats', isActive: 'is_active' };
const normalize = (k, v) => (k === 'code' ? String(v).trim().toUpperCase() : k === 'name' ? String(v).trim() : v);

const updateRoomById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(FIELD_COL)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) { args.push(normalize(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  let rows;
  try {
    ({ rows } = await query(
      `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING id`,
      args,
    ));
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
  return rows[0] ? findRoomByIdLean(id) : null; // re-read with office populated (matches .populate)
};

const softDeleteRoom = async (id) => {
  const { rows } = await query(
    `UPDATE rooms SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`,
    [id],
  );
  return rows[0] ? roomRow(rows[0], { populated: false }) : null;
};

const findLiveOffice = async (officeId) => {
  const { rows } = await query(`SELECT id FROM offices WHERE id = $1 AND is_deleted = false`, [officeId]);
  return rows[0] ? { _id: rows[0].id } : null;
};

const countFutureSessionsForRoom = async (roomId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM schedules WHERE room_id = $1 AND start_time > now()`,
    [roomId],
  );
  return rows[0].n;
};

// Scheduled sessions in [from,to] for the given rooms — booked-hours source for
// the room-utilization report. Mirrors the Mongo lean {roomId,startTime,endTime}
// shape so utilization.js is backend-agnostic. room_id ANY($1) = the {$in} form.
const findRoomedSessionsInRange = async ({ roomIds, from, to }) => {
  const { rows } = await query(
    `SELECT room_id, start_time, end_time FROM schedules
     WHERE status = 'scheduled' AND room_id = ANY($1)
       AND start_time >= $2 AND start_time <= $3`,
    [roomIds.map(String), new Date(from).toISOString(), new Date(to).toISOString()],
  );
  return rows.map((r) => ({ roomId: r.room_id, startTime: r.start_time, endTime: r.end_time }));
};

module.exports = {
  createRoom,
  findRoomByIdLean,
  listRooms,
  updateRoomById,
  softDeleteRoom,
  findLiveOffice,
  countFutureSessionsForRoom,
  findRoomedSessionsInRange,
};
