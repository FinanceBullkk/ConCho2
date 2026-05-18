import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import Portal from '../components/Portal';
import { useAvailability, useBookSlot, useCancelSlot } from '../hooks/useSchedules';
import { useMyTeams } from '../hooks/useTeams';
import { useTimeSlots } from '../hooks/useTimeSlots';

// ──────────────────────────────────────────────────────────
// BookClassPage (v2 — Leader-Created Sessions)
// ──────────────────────────────────────────────────────────
// Timetable grid where Team Leaders click empty slots to
// CREATE new schedule sessions, or click their own to cancel.
// ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Get the Monday of the current week in LOCAL time.
 */
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
};

/**
 * Format a Date to 'YYYY-MM-DD' using LOCAL time.
 */
const toDateKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/**
 * Parse a time slot string "HH:MM-HH:MM" into start/end hours+minutes.
 */
const parseSlot = (slot) => {
  const [startStr, endStr] = slot.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  return { sh, sm, eh, em };
};

/**
 * Build a schedule lookup key from a schedule's startTime.
 * Returns "YYYY-MM-DD|HH:MM" using local time — keyed by START HOUR only.
 *
 * We intentionally ignore the end time so that admin-created schedules
 * with non-standard durations (e.g. 10:00–11:30) still appear in the
 * correct time-slot row ("10:00-11:00") rather than being silently hidden.
 */
const scheduleToKey = (s) => {
  const start = new Date(s.startTime);
  const dateKey = toDateKey(start);
  return `${dateKey}|${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
};

export default function BookClassPage() {
  const { user } = useAuth();
  const TIME_SLOTS = useTimeSlots(); // fetched from DB settings (falls back to hardcoded defaults)
  const bookMutation = useBookSlot();
  const cancelMutation = useCancelSlot();
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [bookModal, setBookModal] = useState(null);   // { day, slot } for creating
  const [cancelModal, setCancelModal] = useState(null); // schedule obj for deleting

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  // ── Data loading ────────────────────────────────────────
  const { data: schedules = [], isLoading: loadingSched } = useAvailability();
  const { data: myTeams = [], isLoading: loadingTeams } = useMyTeams();
  const loading = loadingSched || loadingTeams;

  // ── Determine leader vs member-only ─────────────────────
  const leaderTeams = useMemo(
    () => myTeams.filter(t => t.leaderId?._id === user._id || t.leaderId === user._id),
    [myTeams, user._id]
  );
  const isLeaderOfAny = leaderTeams.length > 0;

  // Auto-select first team the user leads
  useEffect(() => {
    if (leaderTeams.length > 0 && !selectedTeam) {
      setSelectedTeam(leaderTeams[0]._id);
    }
  }, [leaderTeams, selectedTeam]);

  useEffect(() => { document.title = 'TMS — Schedule & Book'; }, []);

  // ── Build the 7 days of the current week ────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      return new Date(weekStart.getTime() + i * 86400000);
    });
  }, [weekStart]);

  // ── Build a lookup map: "YYYY-MM-DD|HH:MM" → Schedule[]
  // Uses an ARRAY per key so that two different classes booking the same
  // time slot (allowed by the class-scoped unique index) both appear on
  // the grid instead of one silently overwriting the other.
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  // ── Create schedule handler (click empty slot) ──────────
  const handleBookSlot = async () => {
    if (!selectedTeam || !bookModal) return;
    setError('');
    try {
      const { day, slot } = bookModal;
      const { sh, sm, eh, em } = parseSlot(slot);
      const startTime = new Date(day); startTime.setHours(sh, sm, 0, 0);
      const endTime = new Date(day); endTime.setHours(eh, em, 0, 0);
      const res = await bookMutation.mutateAsync({
        teamId: selectedTeam,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      setBookModal(null);
      toast.success(res.message || 'Session created successfully! ✅');
    } catch (err) {
      const msg = err.response?.data?.message || 'Booking failed';
      setError(msg);
      setBookModal(null);
    }
  };

  // ── Cancel/delete schedule handler ──────────────────────
  const handleCancel = async () => {
    if (!cancelModal) return;
    setError('');
    try {
      await cancelMutation.mutateAsync(cancelModal._id);
      setCancelModal(null);
      toast.success('Session cancelled successfully');
    } catch (err) {
      const msg = err.response?.data?.message || 'Cancel failed';
      setError(msg);
      setCancelModal(null);
    }
  };

  // ── Week navigation helpers ─────────────────────────────
  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const today = toDateKey(new Date());
  const selectedTeamObj = myTeams.find(t => t._id === selectedTeam);

  // ── Guards ──────────────────────────────────────────────
  if (!loading && myTeams.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-2">Chưa thuộc nhóm nào</h2>
        <p className="text-slate-400">Bạn cần được phân vào một nhóm để có thể xem và đặt lịch học.</p>
      </div>
    );
  }

  if (!loading && !isLeaderOfAny) {
    // User is a member but NOT a leader of any team
    const teamNames = myTeams.map(t => t.name).join(', ');
    return (
      <div className="glass rounded-2xl p-10 text-center animate-fade-in space-y-3">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-bold text-white">Bạn không phải Team Leader</h2>
        <p className="text-slate-400">
          Bạn là thành viên của nhóm <span className="text-primary font-semibold">{teamNames}</span>,
          nhưng chỉ Team Leader mới có thể đặt lịch học.
        </p>
        <p className="text-slate-500 text-sm">
          Vui lòng liên hệ Team Leader của bạn để đặt lịch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Schedule & Book</h1>
          <p className="text-slate-400 mt-1">Click an empty slot to create a session, click your booking to cancel</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400">Booking for:</label>
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          >
            {leaderTeams.map(t => (
              <option key={t._id} value={t._id} className="bg-slate-800">{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2 animate-fade-in">
          <span>⚠️</span> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* ── Week navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">← Prev</button>
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">
            {weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — {weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </h2>
          <button onClick={goToday} className="px-3 py-1 rounded-lg bg-primary/20 text-primary text-xs border border-primary/20 hover:bg-primary/30 transition-all">Today</button>
        </div>
        <button onClick={nextWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">Next →</button>
      </div>

      {/* ── Loading ────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        /* ── Timetable Grid ──────────────────────────── */
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
                      <th key={i} className={`px-2 py-3 border-b border-white/10 text-center ${isToday ? 'bg-primary/10' : ''}`}>
                        <div className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-slate-400'}`}>{DAY_NAMES[i]}</div>
                        <div className={`text-xl font-bold ${isToday ? 'text-primary' : 'text-white'}`}>{day.getDate()}</div>
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
                      const slotStartTime = slot.split('-')[0]; // "10:00-11:00" → "10:00"
                      const cellKey = `${dateKey}|${slotStartTime}`;
                      const scheduleList = scheduleMap[cellKey] || [];
                      const isToday = dateKey === today;
                      const isPast = dateKey < today;

                      // My team's session at this slot (if any)
                      const mySchedule = scheduleList.find(
                        s => s.bookedTeamId?._id === selectedTeam || s.bookedTeamId === selectedTeam
                      );
                      // Any other team's session at this slot
                      const blockerSchedule = !mySchedule && scheduleList.find(
                        s => s.bookedTeamId?._id !== selectedTeam && s.bookedTeamId !== selectedTeam
                      );

                      if (mySchedule) {
                        // ── MY TEAM'S SESSION — blue, cancellable ──
                        return (
                          <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                            <div
                              className="rounded-xl p-2.5 h-full min-h-[80px] transition-all bg-gradient-to-br from-primary/25 to-purple-500/15 border border-primary/30 shadow-sm shadow-primary/10 cursor-pointer hover:border-red-400/40"
                              onClick={() => { if (!isPast) setCancelModal(mySchedule); }}
                            >
                              <div className="text-xs font-bold truncate text-primary">
                                {mySchedule.classId?.classCode}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {mySchedule.classId?.courseName}
                              </div>
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                                  ✓ Your team · Click to cancel
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      }

                      if (blockerSchedule) {
                        // ── ANOTHER TEAM'S SESSION — red, slot is taken ──
                        const teamName = blockerSchedule.bookedTeamId?.name || 'Another team';
                        return (
                          <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                            <div className="rounded-xl p-2.5 h-full min-h-[80px] bg-red-500/10 border border-red-500/15 cursor-default">
                              <div className="text-xs font-bold truncate text-red-400">
                                {blockerSchedule.classId?.classCode}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {blockerSchedule.classId?.courseName}
                              </div>
                              <div className="mt-1.5">
                                <span className="inline-flex items-center text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                                  🔒 {teamName}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      }

                      // ── EMPTY CELL — clickable to book ──
                      return (
                        <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                          <div
                            className={`rounded-xl h-full min-h-[80px] flex items-center justify-center transition-all ${
                              isPast
                                ? 'bg-white/[0.02] cursor-default'
                                : 'bg-white/[0.02] hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent cursor-pointer group/cell'
                            }`}
                            onClick={() => { if (!isPast) setBookModal({ day, slot }); }}
                          >
                            {!isPast && (
                              <span className="text-[10px] text-slate-600 opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">
                                + Book
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
      )}

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/30" />
          <span>Your team's session</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-white/[0.03] border border-dashed border-emerald-500/30" />
          <span>Available — click to book</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-red-500/15 border border-red-500/20" />
          <span>Taken by another team</span>
        </div>
      </div>

      {/* ── Create Booking Modal ───────────────────────── */}
      {bookModal && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 space-y-4 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center">Create Session</h3>

            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Day</span>
                <span className="text-white font-semibold">
                  {bookModal.day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Time</span>
                <span className="text-white">{bookModal.slot}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Team</span>
                <span className="text-primary font-semibold">{selectedTeamObj?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Class</span>
                <span className="text-slate-300">{selectedTeamObj?.classId?.classCode || 'Auto-assigned'}</span>
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
                onClick={handleBookSlot}
                disabled={bookMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary text-white font-semibold hover:from-primary hover:to-primary transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                {bookMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Cancel Booking Modal ───────────────────────── */}
      {cancelModal && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 space-y-4 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center">Cancel Session</h3>

            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Class</span>
                <span className="text-white font-semibold">{cancelModal.classId?.classCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Course</span>
                <span className="text-white">{cancelModal.classId?.courseName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Time</span>
                <span className="text-white">
                  {new Date(cancelModal.startTime).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' '}
                  {new Date(cancelModal.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  –
                  {new Date(cancelModal.endTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>
              <p className="text-xs text-red-400 mt-2">⚠️ This will permanently delete this session.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCancelModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all"
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all disabled:opacity-50"
              >
                {cancelMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                    Cancelling...
                  </span>
                ) : 'Cancel Session'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
