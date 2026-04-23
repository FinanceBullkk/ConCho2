import { useState, useEffect, useMemo } from 'react';
import { schedulesAPI, attendanceAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';

// ──────────────────────────────────────────────────────────
// <AttendanceMarking />
// ──────────────────────────────────────────────────────────
// Teacher selects a schedule → sees enrolled students →
// marks P/A/L/EL for each → bulk submits in one click.
// Uses the bulk upsert API (MongoDB bulkWrite).
// ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'P', label: 'Present', color: 'bg-accent-green/20 text-accent-green border-accent-green/30' },
  { value: 'A', label: 'Absent', color: 'bg-accent-red/20 text-accent-red border-accent-red/30' },
  { value: 'L', label: 'Late', color: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30' },
  { value: 'EL', label: 'Excused', color: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' },
];

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [markedSet, setMarkedSet] = useState(new Set()); // IDs of schedules with attendance
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [records, setRecords] = useState([]);
  const [existingRecords, setExistingRecords] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Date filter state ──────────────────────────────────
  const [filterDate, setFilterDate] = useState(''); // 'YYYY-MM-DD'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'unmarked' | 'marked'

  useEffect(() => { document.title = 'TMS — Attendance'; }, []);

  // Load schedules + check which ones have attendance
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await schedulesAPI.getAll({ limit: 200 });
        const allSchedules = res.data.data;
        setSchedules(allSchedules);

        // Check which schedules have attendance records (batch check)
        const marked = new Set();
        await Promise.all(
          allSchedules.map(async (s) => {
            try {
              const attRes = await attendanceAPI.getBySchedule(s._id);
              if (attRes.data.data && attRes.data.data.length > 0) {
                marked.add(s._id);
              }
            } catch { /* ignore */ }
          })
        );
        setMarkedSet(marked);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ── Filtered + sorted schedules ────────────────────────
  const filteredSchedules = useMemo(() => {
    let list = [...schedules];

    // Date filter
    if (filterDate) {
      list = list.filter((s) => {
        const d = new Date(s.startTime).toISOString().slice(0, 10);
        return d === filterDate;
      });
    }

    // Status filter
    if (filterStatus === 'unmarked') {
      list = list.filter((s) => !markedSet.has(s._id));
    } else if (filterStatus === 'marked') {
      list = list.filter((s) => markedSet.has(s._id));
    }

    // Sort: unmarked first, then by date
    list.sort((a, b) => {
      const aMarked = markedSet.has(a._id) ? 1 : 0;
      const bMarked = markedSet.has(b._id) ? 1 : 0;
      if (aMarked !== bMarked) return aMarked - bMarked;
      return new Date(a.startTime) - new Date(b.startTime);
    });

    return list;
  }, [schedules, markedSet, filterDate, filterStatus]);

  const unmarkedCount = schedules.filter((s) => !markedSet.has(s._id)).length;

  // When schedule is selected, load enrolled users and existing attendance
  const handleSelectSchedule = async (schedule) => {
    setSelectedSchedule(schedule);
    setResult(null);

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

    const recs = (schedule.enrolledUsers || []).map((user) => {
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
  };

  const updateRecord = (idx, field, value) => {
    setRecords((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const markAll = (status) => {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
  };

  const handleSubmit = async () => {
    if (!selectedSchedule || records.length === 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const payload = records.map((r) => ({
        userId: r.userId,
        status: r.status,
        remark: r.remark,
      }));
      const res = await attendanceAPI.bulkMark(selectedSchedule._id, payload);
      setResult({ success: true, message: res.data.message });
      // Update marked set
      setMarkedSet((prev) => new Set([...prev, selectedSchedule._id]));
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">✅ Attendance Marking</h1>
          <p className="text-slate-400 mt-1">
            Select a schedule and mark attendance for all students
            {unmarkedCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber text-xs font-medium">
                {unmarkedCount} not marked
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-wrap gap-3 items-center">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="all" className="bg-slate-800">All ({schedules.length})</option>
            <option value="unmarked" className="bg-slate-800">⏳ Not Marked ({unmarkedCount})</option>
            <option value="marked" className="bg-slate-800">✅ Marked ({schedules.length - unmarkedCount})</option>
          </select>
        </div>
        {(filterDate || filterStatus !== 'all') && (
          <button
            onClick={() => { setFilterDate(''); setFilterStatus('all'); }}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-all self-end"
          >
            ✕ Clear
          </button>
        )}
        <div className="ml-auto text-sm text-slate-500 self-end">
          Showing {filteredSchedules.length} of {schedules.length}
        </div>
      </div>

      {/* Schedule Selector */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Select Schedule</h2>
        {filteredSchedules.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <div className="text-3xl mb-2 opacity-50">📭</div>
            No schedules match your filters
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {filteredSchedules.map((s) => {
              const isSelected = selectedSchedule?._id === s._id;
              const isMarked = markedSet.has(s._id);
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              const timeStr = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}-${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
              const isPast = start < new Date();
              return (
                <button
                  key={s._id}
                  onClick={() => handleSelectSchedule(s)}
                  className={`text-left p-4 rounded-xl border transition-all relative ${
                    isSelected
                      ? 'border-primary-500/50 bg-primary-500/10 glow-primary'
                      : 'border-white/5 glass-light hover:border-white/15'
                  }`}
                >
                  {/* Marked / Not marked badge */}
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isMarked
                      ? 'bg-accent-green/15 text-accent-green'
                      : isPast
                        ? 'bg-accent-red/15 text-accent-red animate-pulse'
                        : 'bg-accent-amber/15 text-accent-amber'
                  }`}>
                    {isMarked ? '✅ Marked' : isPast ? '⚠️ Overdue' : '⏳ Pending'}
                  </div>
                  <div className="font-medium text-white text-sm">{s.classId?.classCode}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {start.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })} • {timeStr}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s.teacherId?.name || 'No teacher'} • {s.enrolledCount}/{s.capacity} students
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Attendance Table */}
      {selectedSchedule && records.length > 0 && (
        <div className="glass rounded-2xl p-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {selectedSchedule.classId?.classCode} — {new Date(selectedSchedule.startTime).toLocaleDateString()}
              </h2>
              <p className="text-sm text-slate-400">{records.length} students enrolled</p>
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
              disabled={submitting}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-green to-teal-400 text-white font-semibold hover:from-accent-green hover:to-teal-300 transition-all disabled:opacity-50 shadow-lg shadow-accent-green/20"
            >
              {submitting ? (
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
      )}

      {selectedSchedule && records.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-slate-400">No students enrolled in this schedule</p>
        </div>
      )}
    </div>
  );
}
