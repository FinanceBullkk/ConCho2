const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');
const { getRoomUtilization } = require('./utilization');

// ──────────────────────────────────────────────────────────
// room/controller — thin HTTP handlers (envelope + audit only).
// (re-center Phase 3) — Office-scoped Rooms, Admin/Coordinator managed.
// ──────────────────────────────────────────────────────────

// GET /api/rooms/utilization?range=&officeId= — booked vs available room-hours.
const utilization = async (req, res) => {
  try {
    const data = await getRoomUtilization({ range: req.query.range, officeId: req.query.officeId || null });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const listRooms = async (req, res) => {
  try {
    const data = await useCases.listRooms(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createRoom = async (req, res) => {
  try {
    const data = await useCases.createRoom(req.body);
    auditService.record({ req, action: 'created', entity: 'Room', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateRoom = async (req, res) => {
  try {
    const { before, after } = await useCases.updateRoom(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'Room', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveRoom = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveRoom(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'Room', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { utilization, listRooms, createRoom, updateRoom, archiveRoom };
