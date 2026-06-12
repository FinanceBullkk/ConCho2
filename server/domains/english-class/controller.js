const { parsePagination, paginatedResponse } = require('../../helpers/pagination');
const { handleError } = require('../../helpers/handleError');
const scheduleService = require('../../services/scheduleService');
const learningUseCases = require('../learning/use-cases');

// ──────────────────────────────────────────────────────────
// English-class controller — thin delegation only.
// ──────────────────────────────────────────────────────────
// The English-class section is a bounded READ surface over the team-booking
// world (owner decision 2026-06-12): every handler forces mode='team' AFTER
// validation and delegates into the existing learning/schedule use-cases.
// No business logic lives here; mutations stay on their existing URLs
// (/api/teams, /api/schedules/book-slot, /api/evaluations).

// GET /api/english/classes — team-world classes (incl. program-less legacy).
// Same DTO + envelope as GET /api/learning/cohorts.
const listClasses = async (req, res) => {
  try {
    const data = await learningUseCases.listCohorts({ ...req.query, mode: 'team', programId: undefined });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

// GET /api/english/schedules — team-world sessions. Mirrors
// domains/schedule/controller.getSchedules including the Participant
// enrolled-only scope (BUG #2 IDOR fix) — keep the two in sync.
const listSchedules = async (req, res) => {
  try {
    const pagination = parsePagination(req);
    const filters = { ...req.query, mode: 'team', classId: undefined };
    if (req.user.role === 'Participant') {
      filters.enrolledUser = req.user._id;
    }
    const { schedules, total } = await scheduleService.listSchedules(filters, pagination);
    res.json(paginatedResponse({ data: schedules, total, page: pagination.page, limit: pagination.limit }));
  } catch (error) {
    handleError(res, error);
  }
};

// GET /api/english/attendance-calendar — team-world attendance statuses
// (Admin all; Teacher scoped inside the use-case, same as /api/schedules).
const attendanceCalendar = async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await scheduleService.getAttendanceCalendar({ from, to, mode: 'team' }, req.user);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listClasses, listSchedules, attendanceCalendar };
