import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAvailability, useBookSlot, useCancelSlot } from '../../hooks/useSchedules';
import { useMyTeams } from '../../hooks/useTeams';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { CalendarGrid, getMonday, toDateKey } from '../../components/CalendarGrid';
import { BookDrawer } from '../../components/BookDrawer';
import { effectiveSchedulingMode, isLeaderBookable, lockedReason } from '../../lib/scheduling-mode';
import { bookingCellState } from '../../lib/booking-cell-state';
import { slotToUtcRange, scheduleSlotId, buildSlotRows } from '../../lib/scheduling-slots';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// BookClassPage — Phase 3 Screen 2 (D2 Drawer)
//
// Participant Leader books empty slots or cancels own sessions. Slots come from
// the server scheduling config (exact windows); a booking submits the exact
// configured start/end (no hour+1). D2 pattern: drawer right sidebar / sheet.
// ──────────────────────────────────────────────────────────

// Bucket a session into a grid cell: local date (matches grid columns) + the
// session's VN wall-clock slot id (matches the descriptor row id).
const scheduleToKey = (s, offset) =>
  `${toDateKey(new Date(s.startTime))}|${scheduleSlotId(s, offset)}`;

export default function BookClassPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const config       = useSchedulingConfig();
  const offset       = config.data?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;
  const bookMutation = useBookSlot();
  const cancelMutation = useCancelSlot();

  const [selectedTeam, setSelectedTeam] = useState('');
  const [drawerMode, setDrawerMode]     = useState(null);   // 'book' | 'cancel' | null
  const [drawerPrefill, setDrawerPrefill] = useState(null); // { day, slot, startTime, endTime, teamObj }
  const [drawerSchedule, setDrawerSchedule] = useState(null); // schedule for cancel

  const [weekStart, setWeekStart] = useState(() => {
    const p = searchParams.get('week');
    if (p) { const d = new Date(p); if (!isNaN(d)) return getMonday(d); }
    return getMonday(new Date());
  });

  const setWeek = (monday) => {
    setWeekStart(monday);
    const next = new URLSearchParams(searchParams);
    next.set('week', toDateKey(monday));
    setSearchParams(next, { replace: true });
  };

  const { data: myTeams   = [], isLoading: loadingTeams  } = useMyTeams();
  const selectedTeamObj  = myTeams.find(t => t._id === selectedTeam);
  const selectedClassId  = selectedTeamObj?.classId?._id;

  // Availability is scoped to the selected team's Class — collisions are
  // per-class (unique {classId,startTime}); other classes never block a slot.
  const { data: schedules = [], isLoading: loadingSched } = useAvailability(
    selectedClassId ? { classId: selectedClassId } : undefined,
  );
  const loading = loadingSched || loadingTeams || config.isLoading;

  const leaderTeams = useMemo(
    () => myTeams.filter(t =>
      (t.leaderId?._id === user._id || t.leaderId === user._id) &&
      t.classId?.status === 'Ongoing'
    ),
    [myTeams, user._id],
  );
  const isLeaderOfAny = leaderTeams.length > 0;

  useEffect(() => {
    if (leaderTeams.length > 0 && !selectedTeam) setSelectedTeam(leaderTeams[0]._id);
  }, [leaderTeams, selectedTeam]);

  useEffect(() => { document.title = 'TMS — Schedule & Book'; }, []);

  // ESC closes drawer. Call the stable setters inline (not closeDrawer, which is
  // declared lower) so render stays order-clean (react-hooks/immutability); the
  // empty dep array stays correct because React state setters are stable.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setDrawerMode(null); setDrawerPrefill(null); setDrawerSchedule(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
  [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s, offset);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules, offset]);

  // Rows = configured (bookable) slots + any in-week off-policy session windows.
  const rows = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return buildSlotRows(config.data?.slots, schedules, offset, weekStart, weekEnd);
  }, [config.data?.slots, schedules, offset, weekStart]);

  const today = toDateKey(new Date());

  // Phase 2 — schedulingMode awareness. Only `leader_booking` lets a leader
  // self-book; other modes (admin_scheduled / cohort) render locked cells + a
  // banner so the leader never hits the server's 403/400 (Pass C enforcement).
  const bookable     = isLeaderBookable(selectedTeamObj);
  const selectedMode = effectiveSchedulingMode(selectedTeamObj);

  const selectedCellKey = useMemo(() => {
    if (drawerMode === 'book' && drawerPrefill) {
      return `${toDateKey(drawerPrefill.day)}|${drawerPrefill.slot.id}`;
    }
    if (drawerMode === 'cancel' && drawerSchedule) {
      return scheduleToKey(drawerSchedule, offset);
    }
    return null;
  }, [drawerMode, drawerPrefill, drawerSchedule, offset]);

  const closeDrawer = () => { setDrawerMode(null); setDrawerPrefill(null); setDrawerSchedule(null); };

  const handleBookSlot = async () => {
    if (!selectedTeam || !drawerPrefill) return;
    try {
      const res = await bookMutation.mutateAsync({
        teamId:    selectedTeam,
        startTime: drawerPrefill.startTime.toISOString(),
        endTime:   drawerPrefill.endTime.toISOString(),
      });
      closeDrawer();
      toast.success(res.message || 'Session created ✅');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
      closeDrawer();
    }
  };

  const handleCancel = async () => {
    if (!drawerSchedule) return;
    try {
      await cancelMutation.mutateAsync(drawerSchedule._id);
      closeDrawer();
      toast.success('Session cancelled');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
      closeDrawer();
    }
  };

  // ── Guards ──────────────────────────────────────────────
  // No team: this learner is not in the team-booking world (Cohesion P4) —
  // point them at the generic learning surfaces instead of a dead end.
  if (!loading && myTeams.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center space-y-3">
        <h2 className="text-h3 text-foreground">No team-booking class</h2>
        <p className="text-muted-foreground">
          Team booking is used by group-based classes. Your sessions and
          programs live in your learning space.
        </p>
        <div className="flex items-center justify-center gap-4 pt-1">
          <Link to="/me/sessions" className="text-sm text-primary font-medium hover:underline underline-offset-2">
            My sessions →
          </Link>
          <Link to="/me/catalog" className="text-sm text-primary font-medium hover:underline underline-offset-2">
            Browse catalog →
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !isLeaderOfAny) {
    const teamNames = myTeams.map(t => t.name).join(', ');
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center space-y-3">
        <h2 className="text-h3 text-foreground">You are not a Team Leader</h2>
        <p className="text-muted-foreground">
          You are a member of <span className="text-primary font-semibold">{teamNames}</span>,
          but only the Team Leader can book sessions.
        </p>
        <p className="text-small text-subtle-foreground">Please contact your Team Leader to book a session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Schedule & Book</h1>
          <p className="text-muted-foreground mt-1 text-body">
            {selectedTeamObj ? `${selectedTeamObj.name} · ${selectedTeamObj.members?.length ?? selectedTeamObj.enrolledCount ?? 0} students` : 'Click an empty slot to book, click your session to cancel'}
          </p>
        </div>
        {leaderTeams.length > 1 && (
          <div className="flex items-center gap-3">
            <label htmlFor="book-for-team" className="text-sm text-muted-foreground">Booking for:</label>
            <select
              id="book-for-team"
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            >
              {leaderTeams.map(t => (
                <option key={t._id} value={t._id} className="bg-popover">{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Main: calendar + drawer ─────────────────────── */}
      <div className="lg:flex lg:gap-5 lg:items-start">

        {/* Left: calendar */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Mode banner — shown when the selected team's program isn't leader-bookable */}
          {!loading && !bookable && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-tint px-4 py-3 text-sm text-foreground"
            >
              <Lock className="size-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <span>{t(`booking.modeLocked.${lockedReason(selectedMode)}`)}</span>
            </div>
          )}
          <CalendarGrid
            weekDays={weekDays}
            rows={rows}
            isLoading={loading}
            selectedCellKey={selectedCellKey}
            onPrev={() => setWeek(new Date(weekStart.getTime() - 7 * 86400000))}
            onNext={() => setWeek(new Date(weekStart.getTime() + 7 * 86400000))}
            onToday={() => setWeek(getMonday(new Date()))}
            weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            renderCell={(day, slot) => {
              const dateKey = toDateKey(day);
              const cellKey = `${dateKey}|${slot.id}`;
              const list    = scheduleMap[cellKey] || [];
              const isPast  = dateKey < today;

              const mySchedule = list.find(
                s => s.bookedTeamId?._id === selectedTeam || s.bookedTeamId === selectedTeam,
              );
              const blocker = !mySchedule && list.find(
                s => s.bookedTeamId?._id !== selectedTeam && s.bookedTeamId !== selectedTeam,
              );

              // Off-policy rows (legacy/imported windows) are never bookable.
              const cellBookable = bookable && !slot.offPolicy;
              const variant = bookingCellState({ mySchedule, blocker, isPast, bookable: cellBookable });

              if (variant === 'mine') {
                // Past session of the selected team: kept visible so the leader
                // can see it still counts toward the weekly cap, but read-only —
                // a session that has started can't be cancelled (server 409), so
                // we don't offer the cancel affordance for it.
                if (isPast) {
                  return (
                    <div className="rounded-md p-2.5 h-full min-h-[80px] border border-border bg-muted/30">
                      <div className="text-xs font-bold truncate text-muted-foreground">
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground mr-1">Mine</span>
                        {mySchedule.classId?.classCode}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{selectedTeamObj?.name}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1.5">Completed (counts this week)</div>
                    </div>
                  );
                }
                const isSel = drawerMode === 'cancel' && drawerSchedule?._id === mySchedule._id;
                return (
                  <button
                    type="button"
                    className={`rounded-md p-2.5 h-full min-h-[80px] border transition-colors duration-(--dur) cursor-pointer ${
                      isSel ? 'bg-success/15 border-success/50' : 'bg-success/10 border-success/25 hover:border-success/50'
                    }`}
                    onClick={() => {
                      if (isSel) { closeDrawer(); return; }
                      setDrawerSchedule(mySchedule);
                      setDrawerPrefill(null);
                      setDrawerMode('cancel');
                    }}
                  >
                    <div className="text-xs font-bold truncate text-success">
                      <span className="bg-success/20 px-1.5 py-0.5 rounded text-[10px] font-bold text-success mr-1">Mine</span>
                      {mySchedule.classId?.classCode}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{selectedTeamObj?.name}</div>
                    <div className="text-[10px] text-success/60 mt-1.5">Click to cancel</div>
                  </button>
                );
              }

              if (variant === 'blocker') {
                return (
                  <div className="rounded-md p-2.5 h-full min-h-[80px] bg-muted/30 border border-border">
                    <div className="text-xs font-bold truncate text-muted-foreground">{blocker.classId?.classCode}</div>
                    <div className="mt-1.5">
                      <span className="inline-flex text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded truncate">
                        {blocker.bookedTeamId?.name || 'Team'}
                      </span>
                    </div>
                  </div>
                );
              }

              if (variant === 'bookable') {
                const { startISO, endISO } = slotToUtcRange(day, slot, offset);
                const isSel = drawerMode === 'book' && selectedCellKey === cellKey;

                return (
                  <button
                    type="button"
                    className={`rounded-md h-full min-h-[80px] flex items-center justify-center border border-dashed transition-colors duration-(--dur) cursor-pointer ${
                      isSel
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-primary/25 bg-primary/[0.03] hover:bg-primary/10 hover:border-primary/40'
                    }`}
                    onClick={() => {
                      if (isSel) { closeDrawer(); return; }
                      setDrawerPrefill({
                        day,
                        slot,
                        startTime: new Date(startISO),
                        endTime: new Date(endISO),
                        teamObj: selectedTeamObj,
                      });
                      setDrawerSchedule(null);
                      setDrawerMode('book');
                    }}
                  >
                    <span className="text-[11px] text-primary/60 font-medium">+ Book</span>
                  </button>
                );
              }

              if (variant === 'locked') {
                // Mode lock (Phase 2): lock icon + hint. Off-policy empty cells
                // are simply muted (not bookable, but not a mode restriction).
                if (!bookable) {
                  return (
                    <div
                      className="rounded-md h-full min-h-[80px] flex items-center justify-center border border-dashed border-border bg-muted/20 cursor-not-allowed"
                      title={t('booking.lockedHint')}
                      aria-disabled="true"
                    >
                      <Lock className="size-3.5 text-muted-foreground/50" aria-hidden="true" />
                    </div>
                  );
                }
                return <div className="h-full min-h-[80px] rounded-md bg-muted/20" />;
              }

              // 'empty-past' — muted, never interactive
              return <div className="h-full min-h-[80px] rounded-md bg-muted/20" />;
            }}
          />

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded bg-success/10 border border-success/25" />
              <span>Your session — click to cancel</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded border border-dashed border-primary/25" />
              <span>Available — click to book</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded bg-muted/30 border border-border" />
              <span>Taken by another team</span>
            </div>
            {!bookable && (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded border border-dashed border-border bg-muted/20 flex items-center justify-center">
                  <Lock className="size-2.5 text-muted-foreground/50" aria-hidden="true" />
                </div>
                <span>{t('booking.legendLocked')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: drawer */}
        <div className="lg:w-[300px] lg:flex-none lg:sticky lg:top-6">
          <BookDrawer
            isOpen={!!drawerMode}
            mode={drawerMode || 'book'}
            schedule={drawerSchedule}
            prefill={drawerPrefill}
            allSchedules={schedules}
            isPending={bookMutation.isPending || cancelMutation.isPending}
            onClose={closeDrawer}
            onBook={handleBookSlot}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}
