import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAvailability, useBookSlot, useCancelSlot } from '../hooks/useSchedules';
import { useMyTeams } from '../hooks/useTeams';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { CalendarGrid, getMonday, toDateKey } from '../components/CalendarGrid';
import { BookDrawer } from '../components/BookDrawer';
import { effectiveSchedulingMode, isLeaderBookable, lockedReason } from '../lib/scheduling-mode';
import { bookingCellState } from '../lib/booking-cell-state';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// BookClassPage — Phase 3 Screen 2 (D2 Drawer)
//
// Participant Leader books empty slots or cancels own sessions.
// D2 pattern: drawer right sidebar on desktop, bottom sheet on mobile.
// ──────────────────────────────────────────────────────────

const parseSlot = (slot) => {
  const [s, e] = slot.split('-');
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return { sh, sm, eh, em };
};

const scheduleToKey = (s) => {
  const d = new Date(s.startTime);
  return `${toDateKey(d)}|${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function BookClassPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const TIME_SLOTS   = useTimeSlots();
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

  const { data: schedules = [], isLoading: loadingSched } = useAvailability();
  const { data: myTeams   = [], isLoading: loadingTeams  } = useMyTeams();
  const loading = loadingSched || loadingTeams;

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

  // ESC closes drawer
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // closeDrawer only calls stable state setters — [] is safe
  }, []);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
  [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  const timeRows = useMemo(() => TIME_SLOTS.map(s => parseInt(s.split(':')[0], 10)), [TIME_SLOTS]);

  const today            = toDateKey(new Date());
  const selectedTeamObj  = myTeams.find(t => t._id === selectedTeam);

  // Phase 2 — schedulingMode awareness. Only `leader_booking` lets a leader
  // self-book; other modes (admin_scheduled / cohort) render locked cells + a
  // banner so the leader never hits the server's 403/400 (Pass C enforcement).
  const bookable     = isLeaderBookable(selectedTeamObj);
  const selectedMode = effectiveSchedulingMode(selectedTeamObj);

  const selectedCellKey = useMemo(() => {
    if (drawerMode === 'book' && drawerPrefill) {
      const d = drawerPrefill.startTime;
      return `${toDateKey(d)}|${String(d.getHours()).padStart(2, '0')}:00`;
    }
    if (drawerMode === 'cancel' && drawerSchedule) {
      const d = new Date(drawerSchedule.startTime);
      return `${toDateKey(d)}|${String(d.getHours()).padStart(2, '0')}:00`;
    }
    return null;
  }, [drawerMode, drawerPrefill, drawerSchedule]);

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
  if (!loading && myTeams.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center">
        <h2 className="text-h3 text-foreground mb-2">Not in any group</h2>
        <p className="text-muted-foreground">You need to be assigned to a group before you can view and book sessions.</p>
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
            {selectedTeamObj ? `${selectedTeamObj.name} · ${selectedTeamObj.enrolledCount ?? 0} students` : 'Click an empty slot to book, click your session to cancel'}
          </p>
        </div>
        {leaderTeams.length > 1 && (
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
            timeRows={timeRows}
            isLoading={loading}
            selectedCellKey={selectedCellKey}
            onPrev={() => setWeek(new Date(weekStart.getTime() - 7 * 86400000))}
            onNext={() => setWeek(new Date(weekStart.getTime() + 7 * 86400000))}
            onToday={() => setWeek(getMonday(new Date()))}
            weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            renderCell={(day, hour) => {
              const dateKey  = toDateKey(day);
              const slotStart = `${String(hour).padStart(2, '0')}:00`;
              const cellKey  = `${dateKey}|${slotStart}`;
              const list     = scheduleMap[cellKey] || [];
              const isPast   = dateKey < today;

              const mySchedule = list.find(
                s => s.bookedTeamId?._id === selectedTeam || s.bookedTeamId === selectedTeam,
              );
              const blocker = !mySchedule && list.find(
                s => s.bookedTeamId?._id !== selectedTeam && s.bookedTeamId !== selectedTeam,
              );

              const variant = bookingCellState({ mySchedule, blocker, isPast, bookable });

              if (variant === 'mine') {
                const isSel = drawerMode === 'cancel' && drawerSchedule?._id === mySchedule._id;
                return (
                  <div
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
                  </div>
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
                const slot = `${slotStart}-${String(hour + 1).padStart(2, '0')}:00`;
                const { sh, sm, eh, em } = parseSlot(slot);
                const startTime = new Date(day); startTime.setHours(sh, sm, 0, 0);
                const endTime   = new Date(day); endTime.setHours(eh, em, 0, 0);
                const isSel = drawerMode === 'book' && selectedCellKey === `${dateKey}|${String(hour).padStart(2, '0')}:00`;

                return (
                  <div
                    className={`rounded-md h-full min-h-[80px] flex items-center justify-center border border-dashed transition-colors duration-(--dur) cursor-pointer ${
                      isSel
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-primary/25 bg-primary/[0.03] hover:bg-primary/10 hover:border-primary/40'
                    }`}
                    onClick={() => {
                      if (isSel) { closeDrawer(); return; }
                      setDrawerPrefill({ day, slot, startTime, endTime, teamObj: selectedTeamObj });
                      setDrawerSchedule(null);
                      setDrawerMode('book');
                    }}
                  >
                    <span className="text-[11px] text-primary/60 font-medium">+ Book</span>
                  </div>
                );
              }

              if (variant === 'locked') {
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
