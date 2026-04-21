import { useState, useEffect, useMemo } from 'react';
import { schedulesAPI, teamsAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';

// ──────────────────────────────────────────────────────────
// CONFIG: Define the time slots shown on the Y-axis
// Each slot is 1 hour. Adjust this array to match your
// institution's timetable.
// ──────────────────────────────────────────────────────────
const TIME_SLOTS = [
  '08:00-09:00',
  '09:00-10:00',
  '10:00-11:00',
  '11:00-12:00',
  '13:00-14:00',
  '14:00-15:00',
  '15:00-16:00',
  '16:00-17:00',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Get the Monday (UTC) of the week containing `date`.
 * Uses UTC methods so the grid matches MongoDB's UTC dates.
 */
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
};

/**
 * Format a Date to 'YYYY-MM-DD' using UTC.
 * This ensures schedule dates from MongoDB (stored as UTC)
 * are compared correctly regardless of the browser's timezone.
 */
const toDateKey = (d) => {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

export default function BookClassPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [myTeams, setMyTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [bookModal, setBookModal] = useState(null);
  const [booking, setBooking] = useState(false);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  // ── Data loading ────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const sRes = await schedulesAPI.getAvailability();
      setSchedules(sRes.data.data);

      const tRes = await teamsAPI.getAll();
      const ledTeams = tRes.data.data.filter(t =>
        (t.leaderId?._id || t.leaderId) === user._id
      );
      setMyTeams(ledTeams);
      if (ledTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(ledTeams[0]._id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Build the 7 days of the current week ────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      return new Date(weekStart.getTime() + i * 86400000); // +i days in ms
    });
  }, [weekStart]);

  // ── Build a lookup map: "YYYY-MM-DD|timeSlot" → schedule
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = `${toDateKey(s.date)}|${s.timeSlot}`;
      map[key] = s;
    });
    return map;
  }, [schedules]);

  // ── Booking handler ─────────────────────────────────────
  const handleBook = async () => {
    if (!selectedTeam || !bookModal) return;
    setBooking(true);
    setError('');
    try {
      await schedulesAPI.bookTeam(bookModal._id, selectedTeam);
      setBookModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  // ── Week navigation helpers ─────────────────────────────
  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday = () => setWeekStart(getMonday(new Date()));

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (myTeams.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-2">Not a Team Leader</h2>
        <p className="text-slate-400">You must be assigned as a Team Leader to book classes.</p>
      </div>
    );
  }

  const today = toDateKey(new Date());

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Timetable</h1>
          <p className="text-slate-400 mt-1">Click an empty slot to book your team</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-300 shrink-0">Booking for:</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            {myTeams.map(t => (
              <option key={t._id} value={t._id} className="bg-slate-800">{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Week navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all text-sm">
          ← Prev
        </button>
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">
            {weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            {' — '}
            {weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={goToday} className="px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-300 text-xs font-semibold hover:bg-primary-500/30 transition-all">
            Today
          </button>
        </div>
        <button onClick={nextWeek} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all text-sm">
          Next →
        </button>
      </div>

      {/* ── Timetable Grid ─────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 800 }}>
            {/* Column headers: days of the week */}
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm p-3 text-xs font-semibold text-slate-400 border-b border-r border-white/10 w-24">
                  Time
                </th>
                {weekDays.map((day, i) => {
                  const isToday = toDateKey(day) === today;
                  return (
                    <th
                      key={i}
                      className={`p-3 text-center border-b border-white/10 min-w-[120px] ${isToday ? 'bg-primary-500/10' : ''}`}
                    >
                      <div className={`text-xs font-bold ${isToday ? 'text-primary-300' : 'text-slate-400'}`}>
                        {DAY_NAMES[i]}
                      </div>
                      <div className={`text-lg font-bold ${isToday ? 'text-primary-200' : 'text-white'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {day.toLocaleDateString('en', { month: 'short' })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Rows: time slots */}
            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot} className="group">
                  {/* Time label */}
                  <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-3 py-2 border-r border-b border-white/10 text-xs font-mono text-slate-400 whitespace-nowrap align-middle">
                    {slot}
                  </td>

                  {/* Day cells */}
                  {weekDays.map((day, dayIdx) => {
                    const dateKey = toDateKey(day);
                    const cellKey = `${dateKey}|${slot}`;
                    const schedule = scheduleMap[cellKey];
                    const isToday = dateKey === today;
                    const isPast = dateKey < today;

                    if (schedule) {
                      // ── BOOKED/SCHEDULED CELL ────────────
                      const bookedId = schedule.bookedTeamId?._id || schedule.bookedTeamId;
                      const bookedName = schedule.bookedTeamId?.name;
                      const isMyTeam = bookedId && bookedId === selectedTeam;
                      const isTaken = bookedId && !isMyTeam;
                      const isAvailable = !bookedId;

                      return (
                        <td
                          key={dayIdx}
                          className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}
                        >
                          <div
                            className={`rounded-xl p-2.5 h-full min-h-[80px] transition-all ${
                              isMyTeam
                                ? 'bg-gradient-to-br from-primary-500/25 to-purple-500/15 border border-primary-400/30 shadow-sm shadow-primary-500/10 cursor-default'
                                : isTaken
                                  ? 'bg-red-500/10 border border-red-500/15 cursor-default'
                                  : 'bg-emerald-500/10 border border-emerald-500/15 hover:border-emerald-400/30 cursor-pointer'
                            }`}
                            onClick={() => {
                              if (isAvailable && !isPast) setBookModal(schedule);
                            }}
                          >
                            <div className={`text-xs font-bold truncate ${
                              isMyTeam ? 'text-primary-300' : isTaken ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {schedule.classId?.classCode}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {schedule.classId?.courseName}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              👨‍🏫 {schedule.teacherId?.name}
                            </div>
                            <div className="mt-1.5">
                              {isMyTeam ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-300 bg-primary-500/20 px-2 py-0.5 rounded-full">
                                  ✓ Your team
                                </span>
                              ) : isTaken ? (
                                <span className="inline-flex items-center text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                                  🔒 {bookedName || 'Taken'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                                  Book Slot
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    }

                    // ── EMPTY CELL ────────────────────────
                    return (
                      <td
                        key={dayIdx}
                        className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}
                      >
                        <div className={`rounded-xl h-full min-h-[80px] flex items-center justify-center transition-all ${
                          isPast
                            ? 'bg-white/[0.02]'
                            : 'bg-white/[0.02] hover:bg-white/[0.06] group-hover:border-white/10'
                        }`}>
                          {!isPast && (
                            <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              No class
                            </span>
                          )}
                        </div>
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
          <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-primary-500/30 to-purple-500/20 border border-primary-400/30" />
          <span>Your team's booking</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-emerald-500/15 border border-emerald-500/20" />
          <span>Available — click to book</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-red-500/15 border border-red-500/20" />
          <span>Taken by another team</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-white/[0.03]" />
          <span>No class scheduled</span>
        </div>
      </div>

      {/* ── Confirm Booking Modal ──────────────────────── */}
      {bookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 space-y-4 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center">Confirm Booking</h3>

            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Class</span>
                <span className="text-white font-semibold">{bookModal.classId?.classCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Course</span>
                <span className="text-white">{bookModal.classId?.courseName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Date</span>
                <span className="text-white">{new Date(bookModal.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Time</span>
                <span className="text-white">{bookModal.timeSlot}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Team</span>
                <span className="text-primary-300 font-semibold">{myTeams.find(t => t._id === selectedTeam)?.name}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBookModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={booking}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50 shadow-lg shadow-primary-500/20"
              >
                {booking ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Booking...
                  </span>
                ) : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
