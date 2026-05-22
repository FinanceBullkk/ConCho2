import { useMemo } from 'react';
import { X, TriangleAlert, Clock } from 'lucide-react';
import { detectConflicts } from '../lib/schedule-conflicts';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// BookDrawer — Phase 3 Screen 2 (D2 Drawer pattern)
//
// Participant Leader book / cancel a session slot.
//
// mode='book'   — prefill { startTime, endTime, teamObj }
//                 Conflict warn if any team booked same slot.
// mode='cancel' — schedule object.
//                 24h cutoff guard: Cancel disabled if
//                 session starts within 24 h.
// ──────────────────────────────────────────────────────────

function BookDrawerContent({
  mode, schedule, prefill,
  allSchedules, isPending,
  onClose, onBook, onCancel,
}) {
  const isBook   = mode === 'book';
  const isCancel = mode === 'cancel';

  // Conflict detection (book mode)
  const conflicts = useMemo(() => {
    if (!isBook || !prefill?.startTime || !prefill?.endTime) return [];
    return detectConflicts(allSchedules, {
      startTime: new Date(prefill.startTime).toISOString(),
      endTime:   new Date(prefill.endTime).toISOString(),
    });
  }, [isBook, prefill, allSchedules]);

  // 24h cutoff guard (cancel mode)
  const isWithin24h = isCancel && schedule
    ? new Date(schedule.startTime).getTime() - Date.now() < 24 * 60 * 60 * 1000
    : false;

  const headerDate = isBook ? prefill?.startTime : schedule?.startTime;
  const teamObj    = prefill?.teamObj;

  const inner = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {isBook ? 'Book this slot' : 'Cancel session'}
          </p>
          {headerDate && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {new Date(headerDate).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(headerDate).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
              {teamObj && ` · ${teamObj.name}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
        {/* Book mode — session info */}
        {isBook && teamObj && (
          <div className="rounded-md bg-muted/40 border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Team</span>
              <span className="text-foreground font-semibold text-xs">{teamObj.name}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Class</span>
              <span className="text-foreground text-xs">{teamObj.classId?.classCode || '—'}</span>
            </div>
            {prefill?.startTime && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground text-xs">Time</span>
                <span className="text-foreground text-xs">
                  {new Date(prefill.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  {' – '}
                  {new Date(prefill.endTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Cancel mode — session info */}
        {isCancel && schedule && (
          <div className={cn(
            'rounded-md border divide-y divide-border text-sm',
            isWithin24h ? 'bg-warning/5 border-warning/20' : 'bg-muted/40 border-border',
          )}>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Class</span>
              <span className="text-foreground font-semibold text-xs">{schedule.classId?.classCode}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Course</span>
              <span className="text-foreground text-xs truncate ml-4 text-right">{schedule.classId?.courseName}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Time</span>
              <span className="text-foreground text-xs">
                {new Date(schedule.startTime).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}
                {new Date(schedule.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>
          </div>
        )}

        {/* Conflict warning (book mode) */}
        {isBook && conflicts.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-[11px]">
            <TriangleAlert className="size-3.5 text-warning mt-0.5 shrink-0" strokeWidth={2} />
            <span className="text-warning">
              <strong>Conflict</strong>:{' '}
              {conflicts.slice(0, 3).map(c =>
                [c.bookedTeamId?.name, c.classId?.classCode].filter(Boolean).join(' · ') || 'another session'
              ).join(', ')}
              {conflicts.length > 3 ? ` +${conflicts.length - 3} more` : ''}.
              {' '}Save is still allowed.
            </span>
          </div>
        )}

        {/* 24h cutoff warning (cancel mode) */}
        {isCancel && isWithin24h && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-[11px]">
            <Clock className="size-3.5 text-warning mt-0.5 shrink-0" strokeWidth={2} />
            <span className="text-warning">
              <strong>Within 24h</strong> — cancellation locked. Contact Admin if needed.
            </span>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-border shrink-0 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
          {isCancel ? 'Keep' : 'Cancel'}
        </Button>
        {isBook && (
          <Button size="sm" className="h-8 text-xs" onClick={onBook} disabled={isPending}>
            {isPending
              ? <><Spinner size={12} />Booking…</>
              : conflicts.length > 0 ? 'Book anyway' : 'Book'
            }
          </Button>
        )}
        {isCancel && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={onCancel}
            disabled={isPending || isWithin24h}
            title={isWithin24h ? 'Within 24h · contact Admin' : undefined}
          >
            {isPending ? <><Spinner size={12} />Cancelling…</> : 'Cancel session'}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <div className={cn(
        'bg-card border-border flex flex-col overflow-hidden',
        'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] border-t rounded-t-xl shadow-xl',
        'lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-180px)] lg:rounded-lg lg:border lg:shadow-none',
      )}>
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {inner}
      </div>
    </>
  );
}

export function BookDrawer({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <BookDrawerContent {...props} />;
}
