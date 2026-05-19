import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Portal from '../components/Portal';
import { useAvailability, useBookSlot, useCancelSlot } from '../hooks/useSchedules';
import { useMyTeams } from '../hooks/useTeams';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { CalendarGrid, getMonday, toDateKey } from '../components/CalendarGrid';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// BookClassPage (v2 — Leader-Created Sessions)
// ──────────────────────────────────────────────────────────
// Timetable grid where Team Leaders click empty slots to
// CREATE new schedule sessions, or click their own to cancel.
// ──────────────────────────────────────────────────────────

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
  const [searchParams, setSearchParams] = useSearchParams();
  const TIME_SLOTS = useTimeSlots(); // fetched from DB settings (falls back to hardcoded defaults)
  const bookMutation = useBookSlot();
  const cancelMutation = useCancelSlot();
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [bookModal, setBookModal] = useState(null);   // { day, slot } for creating
  const [cancelModal, setCancelModal] = useState(null); // schedule obj for deleting

  // Week navigation — persisted in URL (?week=YYYY-MM-DD)
  const [weekStart, setWeekStart] = useState(() => {
    const param = searchParams.get('week');
    if (param) { const d = new Date(param); if (!isNaN(d)) return getMonday(d); }
    return getMonday(new Date());
  });

  const setWeek = (monday) => {
    setWeekStart(monday);
    const next = new URLSearchParams(searchParams);
    next.set('week', toDateKey(monday));
    setSearchParams(next, { replace: true });
  };

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

  // ── Derive integer hour rows from TIME_SLOTS ─────────────
  const timeRows = useMemo(() =>
    TIME_SLOTS.map(slot => parseInt(slot.split(':')[0], 10)),
  [TIME_SLOTS]);

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
  const prevWeek = () => setWeek(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeek(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday  = () => setWeek(getMonday(new Date()));

  const today = toDateKey(new Date());
  const selectedTeamObj = myTeams.find(t => t._id === selectedTeam);

  // ── Guards ──────────────────────────────────────────────
  if (!loading && myTeams.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center">
        <h2 className="text-h3 text-foreground mb-2">Chưa thuộc nhóm nào</h2>
        <p className="text-muted-foreground">Bạn cần được phân vào một nhóm để có thể xem và đặt lịch học.</p>
      </div>
    );
  }

  if (!loading && !isLeaderOfAny) {
    // User is a member but NOT a leader of any team
    const teamNames = myTeams.map(t => t.name).join(', ');
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center space-y-3">
        <h2 className="text-h3 text-foreground">Bạn không phải Team Leader</h2>
        <p className="text-muted-foreground">
          Bạn là thành viên của nhóm <span className="text-primary font-semibold">{teamNames}</span>,
          nhưng chỉ Team Leader mới có thể đặt lịch học.
        </p>
        <p className="text-small text-subtle-foreground">
          Vui lòng liên hệ Team Leader của bạn để đặt lịch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Schedule & Book</h1>
          <p className="text-muted-foreground mt-1">Click an empty slot to create a session, click your booking to cancel</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Booking for:</label>
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            className="px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          >
            {leaderTeams.map(t => (
              <option key={t._id} value={t._id} className="bg-popover">{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm flex items-center gap-2">
          {error}
          <button onClick={() => setError('')} className="ml-auto text-destructive hover:text-destructive/70">×</button>
        </div>
      )}

      {/* ── Calendar Grid ──────────────────────────────── */}
      <CalendarGrid
        weekDays={weekDays}
        timeRows={timeRows}
        isLoading={loading}
        onPrev={prevWeek}
        onNext={nextWeek}
        onToday={goToday}
        weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        renderCell={(day, hour) => {
          const dateKey = toDateKey(day);
          const slotStartTime = `${String(hour).padStart(2, '0')}:00`;
          const slot = `${slotStartTime}-${String(hour + 1).padStart(2, '0')}:00`;
          const cellKey = `${dateKey}|${slotStartTime}`;
          const scheduleList = scheduleMap[cellKey] || [];
          const isPast = dateKey < today;

          const mySchedule = scheduleList.find(
            s => s.bookedTeamId?._id === selectedTeam || s.bookedTeamId === selectedTeam
          );
          const blockerSchedule = !mySchedule && scheduleList.find(
            s => s.bookedTeamId?._id !== selectedTeam && s.bookedTeamId !== selectedTeam
          );

          if (mySchedule) {
            return (
              <div
                className="rounded-md p-2.5 h-full min-h-[80px] bg-primary/15 border border-primary/30 transition-colors duration-(--dur) cursor-pointer hover:border-destructive/40"
                onClick={() => { if (!isPast) setCancelModal(mySchedule); }}
              >
                <div className="text-xs font-bold truncate text-primary">{mySchedule.classId?.classCode}</div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">{mySchedule.classId?.courseName}</div>
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded">
                    Your team · Click to cancel
                  </span>
                </div>
              </div>
            );
          }

          if (blockerSchedule) {
            const teamName = blockerSchedule.bookedTeamId?.name || 'Another team';
            return (
              <div className="rounded-md p-2.5 h-full min-h-[80px] bg-destructive/10 border border-destructive/15">
                <div className="text-xs font-bold truncate text-destructive">{blockerSchedule.classId?.classCode}</div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">{blockerSchedule.classId?.courseName}</div>
                <div className="mt-1.5">
                  <span className="inline-flex items-center text-[10px] font-bold text-destructive bg-destructive/20 px-2 py-0.5 rounded">
                    {teamName}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              className={`rounded-md h-full min-h-[80px] flex items-center justify-center transition-colors duration-(--dur) ${
                isPast
                  ? 'bg-muted/20 cursor-default'
                  : 'bg-muted/20 hover:bg-success/10 hover:border-success/20 border border-transparent cursor-pointer group/cell'
              }`}
              onClick={() => { if (!isPast) setBookModal({ day, slot }); }}
            >
              {!isPast && (
                <span className="text-[10px] text-subtle-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">+ Book</span>
              )}
            </div>
          );
        }}
      />

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/20" />
          <span>Your team's session</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded border border-dashed border-success/30" />
          <span>Available — click to book</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-destructive/15 border border-destructive/20" />
          <span>Taken by another team</span>
        </div>
      </div>

      {/* ── Create Booking Modal ───────────────────────── */}
      {bookModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 space-y-4">
              <h3 className="text-h3 text-foreground text-center">Create Session</h3>

              <div className="bg-muted rounded-md p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Day</span>
                  <span className="text-foreground font-semibold">
                    {bookModal.day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Time</span>
                  <span className="text-foreground">{bookModal.slot}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Team</span>
                  <span className="text-primary font-semibold">{selectedTeamObj?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Class</span>
                  <span className="text-muted-foreground">{selectedTeamObj?.classId?.classCode || 'Auto-assigned'}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setBookModal(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleBookSlot} disabled={bookMutation.isPending}>
                  {bookMutation.isPending ? <><Spinner size={14} />Creating…</> : 'Create Session'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Cancel Booking Modal ───────────────────────── */}
      {cancelModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 space-y-4">
              <h3 className="text-h3 text-foreground text-center">Cancel Session</h3>

              <div className="bg-destructive-tint border border-destructive/20 rounded-md p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Class</span>
                  <span className="text-foreground font-semibold">{cancelModal.classId?.classCode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Course</span>
                  <span className="text-foreground">{cancelModal.classId?.courseName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Time</span>
                  <span className="text-foreground">
                    {new Date(cancelModal.startTime).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(cancelModal.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    –
                    {new Date(cancelModal.endTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </div>
                <p className="text-small text-destructive mt-2">This will permanently delete this session.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setCancelModal(null)}>Keep</Button>
                <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? <><Spinner size={14} />Cancelling…</> : 'Cancel Session'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
