import { useState, useEffect, useMemo } from 'react';
import { schedulesAPI, attendanceAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useAttendanceCalendar } from '../hooks/useSchedules';
import { useBulkMarkAttendance } from '../hooks/useAttendance';

// ──────────────────────────────────────────────────────────
// AttendancePage — Calendar View
// ──────────────────────────────────────────────────────────
// Weekly timetable calendar (Mon–Sun × time slots) with
// color-coded attendance status badges. Click a cell to
// open the attendance marking form below.
// ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'P', label: 'Present', color: 'bg-accent-green/20 text-accent-green border-accent-green/30' },
  { value: 'A', label: 'Absent', color: 'bg-accent-red/20 text-accent-red border-accent-red/30' },
  { value: 'L', label: 'Late', color: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30' },
  { value: 'EL', label: 'Excused', color: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' },
];

const TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_CONFIG = {
  done:    { badge: '✅ Done',       cls: 'bg-accent-green/15 text-accent-green border-accent-green/25', leftColor: '#34d399', watermark: '✓', watermarkCls: 'text-emerald-400/15', opacity: 'opacity-70' },
  pending: { badge: '⏳ Pending',    cls: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30', leftColor: '#fbbf24', watermark: '!', watermarkCls: 'text-amber-400/15', opacity: '' },
  partial: { badge: '🔵 Partial',    cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30', leftColor: '#60a5fa', watermark: '½', watermarkCls: 'text-blue-400/15', opacity: '' },
  none:    { badge: '⚪ No students', cls: 'bg-white/5 text-slate-500 border-white/10', leftColor: '#475569', watermark: '—', watermarkCls: 'text-slate-600/10', opacity: 'opacity-40' },
  future:  { badge: '🔮 Chưa diễn ra', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25', leftColor: '#475569', watermark: '⏳', watermarkCls: 'text-slate-500/10', opacity: 'opacity-40' },
};

// ── Helpers ─────────────────────────────────────────────

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
};

const toDateKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const scheduleToKey = (s) => {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  const dateKey = toDateKey(start);
  const timeSlot = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${dateKey}|${timeSlot}`;
};

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const bulkMarkMutation = useBulkMarkAttendance();
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [records, setRecords] = useState([]);
  const [existingRecords, setExistingRecords] = useState([]);
  const [result, setResult] = useState(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  useEffect(() => { document.title = 'TMS — Attendance'; }, []);

  // ── Load schedules with pre-computed attendance status ──
  const { data: schedules = [], isLoading: loading } = useAttendanceCalendar();

  // ── Build the 7 days of the current week ────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000));
  }, [weekStart]);

  // ── Build schedule lookup map ───────────────────────────
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  // ── Summary stats for current week ──────────────────────
  const weekStats = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekSchedules = schedules.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && d < weekEnd;
    });
    return {
      total: weekSchedules.length,
      done: weekSchedules.filter(s => s.attendanceStatus === 'done').length,
      pending: weekSchedules.filter(s => s.attendanceStatus === 'pending').length,
      partial: weekSchedules.filter(s => s.attendanceStatus === 'partial').length,
      none: weekSchedules.filter(s => s.attendanceStatus === 'none').length,
    };
  }, [schedules, weekStart]);

  // ── Week navigation ─────────────────────────────────────
  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday = () => setWeekStart(getMonday(new Date()));
  const today = toDateKey(new Date());

  // ── Select schedule → load attendance form ──────────────
  const handleSelectSchedule = async (schedule) => {
    // Need to re-fetch the full schedule with enrolledUsers populated
    setSelectedSchedule(schedule);
    setResult(null);
    setRecords([]);

    try {
      // Get full schedule with enrolled users
      const scheduleRes = await schedulesAPI.getById(schedule._id);
      const fullSchedule = scheduleRes.data.data;

      let existing = [];
      try {
        const res = await attendanceAPI.getBySchedule(schedule._id);
        existing = res.data.data;
        setExistingRecords(existing);
      } catch {
        setExistingRecords([]);
      }

      const existingMap = {};
      existing.forEach((r) => {
        existingMap[r.userId?._id || r.userId] = r;
      });

      const recs = (fullSchedule.enrolledUsers || []).map((user) => {
        const prev = existingMap[user._id];
        return {
          userId: user._id,
          empCode: user.empCode,
          name: user.name,
          department: user.department,
          status: prev?.status || 'P',
          remark: prev?.remark || '',
        };
      });

      setRecords(recs);
      setSelectedSchedule({ ...schedule, ...fullSchedule });
    } catch (err) {
      console.error('Failed to load schedule details:', err);
    }
  };

  const updateRecord = (idx, field, value) => {
    setRecords((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const markAll = (status) => {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
  };

  const handleSubmit = async () => {
    if (!selectedSchedule || records.length === 0) return;
    setResult(null);
    try {
      const payload = records.map((r) => ({
        userId: r.userId,
        status: r.status,
        remark: r.remark,
      }));
      const res = await bulkMarkMutation.mutateAsync({ scheduleId: selectedSchedule._id, records: payload });
      setResult({ success: true, message: res.message });
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to submit' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">✅ Attendance Marking</h1>
          <p className="text-slate-400 mt-1">
            Click a session on the calendar to mark attendance
          </p>
        </div>
      </div>

      {/* ── Week Stats Banner ──────────────────────────── */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-4 flex-wrap">
          {weekStats.pending > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-amber/10 border border-accent-amber/20">
              <span className="text-accent-amber text-sm font-semibold">{weekStats.pending}</span>
              <span className="text-xs text-accent-amber/70">pending</span>
            </div>
          )}
          {weekStats.partial > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 text-sm font-semibold">{weekStats.partial}</span>
              <span className="text-xs text-blue-400/70">partial</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-green/10 border border-accent-green/20">
            <span className="text-accent-green text-sm font-semibold">{weekStats.done}</span>
            <span className="text-xs text-accent-green/70">done</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-slate-400 text-sm font-semibold">{weekStats.total}</span>
            <span className="text-xs text-slate-500">total this week</span>
          </div>
        </div>
      </div>

      {/* ── Week Navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">← Prev</button>
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">
            {weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — {weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </h2>
          <button onClick={goToday} className="px-3 py-1 rounded-lg bg-primary-500/20 text-primary-300 text-xs border border-primary-500/20 hover:bg-primary-500/30 transition-all">Today</button>
        </div>
        <button onClick={nextWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">Next →</button>
      </div>

      {/* ── Timetable Calendar ─────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-3 py-3 border-b border-r border-white/10 text-xs text-slate-500 w-24">Time</th>
                {weekDays.map((day, i) => {
                  const dateKey = toDateKey(day);
                  const isToday = dateKey === today;
                  return (
                    <th key={i} className={`px-2 py-3 border-b border-white/10 text-center ${isToday ? 'bg-primary-500/10' : ''}`}>
                      <div className={`text-xs font-bold ${isToday ? 'text-primary-300' : 'text-slate-400'}`}>{DAY_NAMES[i]}</div>
                      <div className={`text-xl font-bold ${isToday ? 'text-primary-200' : 'text-white'}`}>{day.getDate()}</div>
                      <div className="text-[10px] text-slate-500">{day.toLocaleDateString('en', { month: 'short' })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot} className="group">
                  <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-3 py-2 border-r border-b border-white/10 text-xs font-mono text-slate-400 whitespace-nowrap align-middle">
                    {slot}
                  </td>

                  {weekDays.map((day, dayIdx) => {
                    const dateKey = toDateKey(day);
                    const cellKey = `${dateKey}|${slot}`;
                    const cellSchedules = scheduleMap[cellKey] || [];
                    const isToday = dateKey === today;
                    const isPast = new Date(day) < new Date(new Date().setHours(0, 0, 0, 0));

                    if (cellSchedules.length > 0) {
                      const schedule = cellSchedules[0];
                      const isFutureSession = new Date(schedule.startTime) > new Date();
                      const effectiveStatus = isFutureSession ? 'future' : schedule.attendanceStatus;
                      const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
                      const isSelected = selectedSchedule?._id === schedule._id;
                      const isOverdue = schedule.attendanceStatus === 'pending' && isPast && !isFutureSession;

                      // Dynamic background based on status
                      const bgMap = {
                        done: 'bg-emerald-500/[0.08]',
                        pending: 'bg-amber-500/[0.15]',
                        partial: 'bg-blue-500/[0.12]',
                        none: 'bg-white/[0.02]',
                        future: 'bg-slate-500/[0.04]',
                      };
                      const cellBg = isOverdue ? 'bg-red-500/[0.15]' : (bgMap[effectiveStatus] || 'bg-white/[0.03]');
                      const leftColor = isOverdue ? '#f87171' : cfg.leftColor;

                      return (
                        <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}>
                          <div
                            className={`rounded-xl p-2.5 pl-3 h-full min-h-[80px] transition-all cursor-pointer relative overflow-hidden ${cellBg} ${cfg.opacity} ${
                              isSelected ? 'ring-2 ring-primary-400 ring-offset-1 ring-offset-slate-900 shadow-lg shadow-primary-500/20 !opacity-100' : 'hover:scale-[1.02] hover:!opacity-100'
                            }`}
                            style={{ borderLeft: `4px solid ${leftColor}`, borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            onClick={() => handleSelectSchedule(schedule)}
                          >
                            {/* Status badge */}
                            <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls} ${isOverdue ? 'animate-pulse !bg-red-500/20 !text-red-400 !border-red-500/30' : ''}`}>
                              {isOverdue ? '⚠️ Overdue' : cfg.badge}
                            </div>

                            {/* Class info */}
                            <div className="text-xs font-bold text-white mt-1.5 truncate">
                              {schedule.classId?.classCode}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {schedule.classId?.courseName}
                            </div>

                            {/* Meta */}
                            <div className="text-[10px] text-slate-500 mt-1 truncate">
                              {schedule.enrolledCount || 0}👤
                            </div>

                            {/* Marked progress */}
                            {effectiveStatus !== 'future' && effectiveStatus !== 'none' && (
                              <div className="mt-1.5">
                                <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                                  <span>{schedule.markedCount || 0}/{schedule.enrolledCount || 0}</span>
                                </div>
                                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      effectiveStatus === 'done' ? 'bg-emerald-400' : effectiveStatus === 'partial' ? 'bg-blue-400' : 'bg-amber-400'
                                    }`}
                                    style={{ width: `${schedule.enrolledCount > 0 ? Math.round(((schedule.markedCount || 0) / schedule.enrolledCount) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // ── Empty cell ──
                    return (
                      <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}>
                        <div className="rounded-xl h-full min-h-[80px] bg-white/[0.02]" />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 rounded bg-emerald-500/[0.12] border border-emerald-400/30 border-l-4 border-l-emerald-400" />
          <span>Done — All marked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 rounded bg-amber-500/[0.15] border border-amber-400/30 border-l-4 border-l-amber-400" />
          <span>Pending — Not yet marked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 rounded bg-red-500/[0.15] border border-red-400/30 border-l-4 border-l-red-400" />
          <span className="text-red-400 font-semibold">Overdue — Past, not marked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 rounded bg-blue-500/[0.12] border border-blue-400/30 border-l-4 border-l-blue-400" />
          <span>Partial — Some marked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 rounded bg-white/[0.04] border border-slate-600/30 border-l-4 border-l-slate-600 opacity-50" />
          <span>Future / No students</span>
        </div>
      </div>

      {/* ── Attendance Marking Panel ───────────────────── */}
      {selectedSchedule && new Date(selectedSchedule.startTime) > new Date() && (
        <div className="glass rounded-2xl p-8 text-center animate-fade-in">
          <div className="text-3xl mb-2 opacity-50">🔮</div>
          <p className="text-slate-400 font-semibold">Buổi học chưa diễn ra</p>
          <p className="text-slate-500 text-sm mt-1">
            Không thể điểm danh cho buổi học trong tương lai. Vui lòng quay lại sau khi buổi học đã bắt đầu.
          </p>
          <p className="text-xs text-slate-600 mt-3">
            Lịch học: {new Date(selectedSchedule.startTime).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
      {selectedSchedule && new Date(selectedSchedule.startTime) <= new Date() && records.length > 0 && (() => {
        const isFuture = new Date(selectedSchedule.startTime) > new Date();
        const isPast = new Date(selectedSchedule.startTime) < new Date(new Date().setHours(0, 0, 0, 0));
        const status = selectedSchedule.attendanceStatus || 'pending';
        const isOverdue = status === 'pending' && isPast && !isFuture;
        // Panel accent colors
        const panelStyles = {
          done:    { border: '#34d399', bg: 'rgba(52, 211, 153, 0.06)', label: '✅ Done', labelCls: 'text-emerald-400' },
          pending: { border: '#fbbf24', bg: 'rgba(251, 191, 36, 0.06)', label: '⏳ Pending', labelCls: 'text-amber-400' },
          partial: { border: '#60a5fa', bg: 'rgba(96, 165, 250, 0.06)', label: '🔵 Partial', labelCls: 'text-blue-400' },
          none:    { border: '#475569', bg: 'transparent', label: '', labelCls: '' },
        };
        const ps = isOverdue
          ? { border: '#f87171', bg: 'rgba(248, 113, 113, 0.06)', label: '⚠️ Overdue', labelCls: 'text-red-400' }
          : (panelStyles[status] || panelStyles.pending);

        return (
        <div
          className="glass rounded-2xl p-6 animate-fade-in"
          style={{ borderLeft: `4px solid ${ps.border}`, backgroundColor: ps.bg }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">
                  {selectedSchedule.classId?.classCode} — {new Date(selectedSchedule.startTime).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                </h2>
                <span className={`text-xs font-bold ${ps.labelCls}`}>{ps.label}</span>
              </div>
              <p className="text-sm text-slate-400">{records.length} students enrolled · {selectedSchedule.classId?.courseName}</p>
            </div>
            {/* Quick mark all buttons */}
            <div className="flex gap-2">
              <span className="text-xs text-slate-500 self-center mr-1">Mark all:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => markAll(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:scale-105 ${opt.color}`}
                >
                  {opt.value}
                </button>
              ))}
            </div>
          </div>

          {/* Roster */}
          <div className="space-y-2 stagger">
            {records.map((record, idx) => (
              <div key={record.userId} className="glass-light rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Student info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center text-xs font-bold text-primary-300">
                      {record.empCode?.slice(-2)}
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm truncate">{record.name}</div>
                      <div className="text-xs text-slate-500">{record.empCode} • {record.department}</div>
                    </div>
                  </div>
                </div>

                {/* Status buttons */}
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateRecord(idx, 'status', opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        record.status === opt.value
                          ? opt.color + ' scale-105 shadow-md'
                          : 'border-white/5 text-slate-500 hover:border-white/15 hover:text-slate-300'
                      }`}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>

                {/* Remark input */}
                <input
                  type="text"
                  placeholder="Remark..."
                  value={record.remark}
                  onChange={(e) => updateRecord(idx, 'remark', e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 rounded-lg bg-surface-lighter/60 border border-white/5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50 transition-all"
                />
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={bulkMarkMutation.isPending}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-green to-teal-400 text-white font-semibold hover:from-accent-green hover:to-teal-300 transition-all disabled:opacity-50 shadow-lg shadow-accent-green/20"
            >
              {bulkMarkMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                `Submit Attendance (${records.length} records)`
              )}
            </button>

            {result && (
              <div className={`px-4 py-2 rounded-xl text-sm animate-fade-in ${
                result.success ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
              }`}>
                {result.message}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {selectedSchedule && records.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center animate-fade-in">
          <div className="text-3xl mb-2 opacity-50">📭</div>
          <p className="text-slate-400">No students enrolled in this schedule</p>
          <p className="text-slate-500 text-sm mt-1">Attendance cannot be marked for sessions with 0 enrolled students</p>
        </div>
      )}
    </div>
  );
}
