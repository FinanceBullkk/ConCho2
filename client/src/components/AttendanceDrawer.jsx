import { Check, X, TriangleAlert, UserX, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// AttendanceDrawer — Phase 3 Screen 1 (D2 Drawer pattern)
//
// Desktop: static right-column panel (parent uses CSS grid).
// Mobile:  fixed bottom sheet (z-50) with backdrop (z-40).
//
// The generic workflow defaults to P/A. English Operations supplies P/L/A/EL
// while retaining the same weekly grid and roster drawer.
// ──────────────────────────────────────────────────────────

const STATUS_STYLES = {
  P: { active: 'bg-success/20 text-success border-success/40',             idle: 'border-border text-muted-foreground hover:text-success hover:border-success/40' },
  L: { active: 'bg-info/20 text-info border-info/40',                      idle: 'border-border text-muted-foreground hover:text-info hover:border-info/40' },
  A: { active: 'bg-destructive/20 text-destructive border-destructive/40', idle: 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/40' },
  EL: { active: 'bg-warning/20 text-warning border-warning/40',            idle: 'border-border text-muted-foreground hover:text-warning hover:border-warning/40' },
};

function StatusBtn({ value, active, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'size-8 rounded-md text-[11px] font-semibold border transition-colors duration-(--dur-fast) shrink-0 disabled:cursor-default',
        active ? STATUS_STYLES[value].active : STATUS_STYLES[value].idle,
      )}
    >
      {value}
    </button>
  );
}

export function AttendanceDrawer({
  isOpen,
  isLoading,
  schedule,
  records,
  isPending,
  result,
  isStale,
  isAdmin,
  isDirty,
  confirmingClose,
  onCloseRequest,
  onCancelClose,
  onDiscardAndClose,
  onMarkAll,
  onRecordUpdate,
  onSubmit,
  makeRowKeyHandler,
  statusOptions = ['P', 'A'],
  isReadOnly = false,
  readOnlyLabel,
  inline = false,
}) {
  if (!isOpen) return null;

  const isFuture   = schedule && new Date(schedule.startTime) > new Date();
  const hasRoster  = !isFuture && records.length > 0;
  const hasAnyA    = records.some(r => r.status === 'A');
  const unmarked   = records.filter(r => !r.isMarked).length;

  const inner = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {schedule?.classId?.classCode ?? '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {schedule && new Date(schedule.startTime).toLocaleDateString('en', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
            {schedule && ` · ${new Date(schedule.startTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`}
            {hasRoster && ` · ${records.length} students`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseRequest}
          aria-label="Close attendance panel"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Bulk action ────────────────────────────── */}
      {hasRoster && !isReadOnly && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={() => onMarkAll('P')}
          >
            <Check className="size-3" />
            {hasAnyA ? 'Reset all to P' : 'Mark all Present'}
          </Button>
        </div>
      )}

      {/* ── Body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {isReadOnly && readOnlyLabel && (
          <div className="mx-4 mt-3 rounded-md border border-border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground">
            {readOnlyLabel}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Spinner size={18} />
            <span className="text-sm">Loading roster…</span>
          </div>
        )}

        {/* Future session */}
        {!isLoading && isFuture && (
          <div className="p-6 text-center">
            <CalendarDays className="mx-auto size-7 text-neutral mb-2" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Session hasn't started</p>
            <p className="text-xs text-muted-foreground mt-1">
              Attendance can only be marked after the session begins.
            </p>
          </div>
        )}

        {/* No roster */}
        {!isLoading && !isFuture && records.length === 0 && (
          <div className="p-6 text-center">
            <UserX className="mx-auto size-7 text-destructive mb-2" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No roster</p>
            <p className="text-xs text-muted-foreground mt-1">
              No enrolled students. Check the class roster for a configuration error.
            </p>
          </div>
        )}

        {/* Stale warning (§1F) */}
        {!isLoading && hasRoster && isStale && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-[11px]">
            <TriangleAlert className="size-3.5 text-warning mt-0.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="text-warning">
              <strong>Over 7 days old.</strong>{' '}
              Marking is still allowed{isAdmin ? '' : ' — contact Admin if needed'}.
            </span>
          </div>
        )}

        {/* Roster rows */}
        {!isLoading && hasRoster && (
          <div className="divide-y divide-border">
            {records.map((record, idx) => {
              return (
                <div
                  key={record.userId}
                  role={isReadOnly ? undefined : 'button'}
                  tabIndex={isReadOnly ? undefined : 0}
                  onKeyDown={isReadOnly ? undefined : makeRowKeyHandler(idx)}
                  className="px-4 py-2.5 focus:outline-none focus:bg-primary/5 transition-colors"
                  aria-label={isReadOnly
                    ? `${record.name} — ${record.statusLabel || record.status || readOnlyLabel}`
                    : `${record.name} — press P or A to set status`}
                >
                  <div className="flex items-center gap-2">
                    {/* Avatar */}
                    <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 select-none">
                      {record.empCode?.slice(-2) ?? '??'}
                    </div>

                    {/* Name + dept */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-foreground truncate leading-tight flex items-baseline gap-1.5">
                        {record.name}
                        {!record.isMarked && (
                          <span className="px-1 py-px rounded text-[9px] font-semibold bg-warning-tint text-warning border border-warning/30 leading-none">
                            new
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{record.department}</div>
                    </div>

                    {/* Status buttons are configured by the owning workflow. */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isReadOnly && !record.status && record.statusLabel ? (
                        <span className="text-xs text-muted-foreground">{record.statusLabel}</span>
                      ) : statusOptions.map((status) => (
                        <StatusBtn
                          key={status}
                          value={status}
                          active={record.status === status}
                          onClick={() => onRecordUpdate(idx, 'status', status)}
                          disabled={isReadOnly}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      {hasRoster && !isReadOnly && (
        <div className="px-4 py-2.5 border-t border-border shrink-0 flex items-center gap-2.5">
          {confirmingClose ? (
            <>
              <span className="text-xs text-warning font-medium flex-1">Discard changes?</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelClose}>Keep editing</Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onDiscardAndClose}>Discard</Button>
            </>
          ) : (
            <>
              {result ? (
                <span className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  result.success ? 'text-success' : 'text-destructive',
                )}>
                  {result.success ? <><Check className="size-3" />Saved</> : result.message}
                </span>
              ) : unmarked > 0 ? (
                <span className="text-xs text-warning font-medium">{unmarked} unmarked</span>
              ) : isDirty ? (
                <span className="text-xs text-warning font-medium">Unsaved changes</span>
              ) : null}
              <span className="flex-1" />
              <span className="hidden lg:block text-[10px] text-subtle-foreground tabular-nums">
                {statusOptions.join(' ')} · ESC
              </span>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onSubmit} disabled={isPending}>
                {isPending ? <><Spinner size={12} />Saving…</> : `Save (${records.length})`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {!inline && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseRequest}
          aria-hidden="true"
        />
      )}

      {/* Panel — fixed bottom sheet on mobile, static in grid on desktop */}
      <div className={cn(
        'bg-card border-border flex flex-col overflow-hidden',
        inline
          ? 'static max-h-[560px] rounded-lg border shadow-none'
          : [
            // Mobile: fixed bottom sheet
            'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] border-t rounded-t-xl shadow-xl',
            // Desktop: static (positioned by parent grid + sticky container)
            'lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-180px)] lg:rounded-lg lg:border lg:shadow-none',
          ],
      )}>
        {/* Drag handle (mobile only) */}
        <div className={cn('justify-center pt-2.5 pb-1 shrink-0 lg:hidden', inline ? 'hidden' : 'flex')}>
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {inner}
      </div>
    </>
  );
}
