import { useState, useEffect, useMemo } from 'react';
import { X, TriangleAlert, ArrowRightLeft, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';
import {
  useBulkTransferEnrollment,
  useBulkUpdateEnrollmentStatus,
} from '../hooks/useEnrollments';

// ──────────────────────────────────────────────────────────
// EnrollmentDrawer — Phase 3 Screen 4 (D2 Drawer pattern)
//
// Multi-mode drawer for Roster tab bulk operations:
//   mode='transfer' — pick target team for selected enrollments
//   mode='status'   — pick new status (Active/On-hold/Dropped) + note
//   mode='drop'     — destructive bulk drop with type-confirmation
//
// Selection is passed as `selected: Enrollment[]` so the drawer can
// show a preview list ("from team A → to team B" or "drop 3 students").
//
// Chrome matches AttendanceDrawer / ScheduleDrawer (fixed bottom sheet
// on mobile, static right column on desktop).
// ──────────────────────────────────────────────────────────

const STATUSES = ['Active', 'On-hold', 'Dropped'];

function EnrollmentDrawerContent({
  mode,
  selected,
  teams,
  excludeTeamId,
  onClose,
  onDone,
}) {
  const transferMutation = useBulkTransferEnrollment();
  const statusMutation   = useBulkUpdateEnrollmentStatus();

  const [toTeamId, setToTeamId] = useState('');
  const [status, setStatus]     = useState('Active');
  const [note, setNote]         = useState('');
  const [error, setError]       = useState('');
  const [confirmText, setConfirmText] = useState('');

  // Reset when mode or selection changes. State setters are stable; this
  // is the standard "sync form to incoming props" pattern.
  useEffect(() => {
    setError('');
    setNote('');
    setConfirmText('');
    if (mode === 'transfer') setToTeamId('');
    if (mode === 'status')   setStatus('Active');
  }, [mode, selected]);

  const enrollmentIds = useMemo(() => selected.map((e) => e._id), [selected]);
  const count         = selected.length;
  const isPending     = transferMutation.isPending || statusMutation.isPending;

  // Transfer mode: filter out source team(s)
  const targetTeams = useMemo(() => {
    if (!Array.isArray(teams)) return [];
    return teams.filter((t) => t._id !== excludeTeamId && !t.isDeleted);
  }, [teams, excludeTeamId]);

  // ── Submit handlers ────────────────────────────────────
  const handleTransfer = async () => {
    if (!toTeamId) { setError('Pick a target team'); return; }
    setError('');
    try {
      await transferMutation.mutateAsync({ enrollmentIds, toTeamId, note: note || undefined });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Bulk transfer failed');
    }
  };

  const handleStatus = async () => {
    setError('');
    try {
      await statusMutation.mutateAsync({ enrollmentIds, status, note: note || undefined });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Status update failed');
    }
  };

  const handleDrop = async () => {
    if (confirmText.trim().toLowerCase() !== 'drop') {
      setError('Type DROP to confirm');
      return;
    }
    setError('');
    try {
      await statusMutation.mutateAsync({ enrollmentIds, status: 'Dropped', note: note || undefined });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Drop failed');
    }
  };

  // ── Mode-specific title + icon ──────────────────────────
  const titles = {
    transfer: { label: `Transfer ${count} student${count !== 1 ? 's' : ''}`, Icon: ArrowRightLeft },
    status:   { label: `Change status for ${count} student${count !== 1 ? 's' : ''}`, Icon: TriangleAlert },
    drop:     { label: `Drop ${count} student${count !== 1 ? 's' : ''}`, Icon: AlertOctagon },
  };
  const { label, Icon } = titles[mode] || titles.transfer;

  const inner = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Icon className={cn('size-3.5 shrink-0', mode === 'drop' ? 'text-destructive' : 'text-primary')} strokeWidth={2} />
            <span className="truncate">{label}</span>
          </div>
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
        {/* Preview list */}
        <div className="rounded-md border border-border bg-muted/40">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
            Affected students
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-border">
            {selected.slice(0, 10).map((e) => (
              <li key={e._id} className="px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="font-mono text-primary text-[10px]">{e.userId?.empCode}</span>
                <span className="text-foreground truncate">{e.userId?.name}</span>
                <span className="ml-auto text-subtle-foreground text-[10px]">{e.teamId?.name || '—'}</span>
              </li>
            ))}
            {selected.length > 10 && (
              <li className="px-3 py-1.5 text-[10px] text-muted-foreground italic">
                +{selected.length - 10} more…
              </li>
            )}
          </ul>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {error}
          </div>
        )}

        {/* ── Transfer mode form ─────────────────────────── */}
        {mode === 'transfer' && (
          <>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 font-medium">Target team</label>
              <select
                value={toTeamId}
                onChange={(e) => setToTeamId(e.target.value)}
                required
                className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              >
                <option value="" className="bg-popover">Select team…</option>
                {targetTeams.map((t) => (
                  <option key={t._id} value={t._id} className="bg-popover">
                    {t.name}{t.classId?.classCode ? ` → ${t.classId.classCode}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <NoteField note={note} setNote={setNote} />
          </>
        )}

        {/* ── Status mode form ───────────────────────────── */}
        {mode === 'status' && (
          <>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 font-medium">New status</label>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-pressed={status === s}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium border transition-colors',
                      status === s
                        ? s === 'Active'
                          ? 'bg-success/15 border-success/40 text-success'
                          : s === 'On-hold'
                          ? 'bg-warning/15 border-warning/40 text-warning'
                          : 'bg-destructive/15 border-destructive/40 text-destructive'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <NoteField note={note} setNote={setNote} />
          </>
        )}

        {/* ── Drop confirmation ──────────────────────────── */}
        {mode === 'drop' && (
          <>
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              <AlertOctagon className="size-3.5 mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                <strong>This is permanent.</strong> Drop removes {count} student{count !== 1 ? 's' : ''} from
                the class. Type <code className="font-mono font-bold">DROP</code> to confirm.
              </span>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 font-medium">Type DROP to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DROP"
                className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-destructive transition-colors font-mono"
              />
            </div>
            <NoteField note={note} setNote={setNote} placeholder="Reason for drop (optional)" />
          </>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-border shrink-0 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        {mode === 'transfer' && (
          <Button size="sm" className="h-8 text-xs" onClick={handleTransfer} disabled={isPending || !toTeamId}>
            {isPending ? <><Spinner size={12} />Transferring…</> : `Transfer ${count}`}
          </Button>
        )}
        {mode === 'status' && (
          <Button size="sm" className="h-8 text-xs" onClick={handleStatus} disabled={isPending}>
            {isPending ? <><Spinner size={12} />Saving…</> : `Set ${status}`}
          </Button>
        )}
        {mode === 'drop' && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={handleDrop}
            disabled={isPending || confirmText.trim().toLowerCase() !== 'drop'}
          >
            {isPending ? <><Spinner size={12} />Dropping…</> : `Drop ${count}`}
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

function NoteField({ note, setNote, placeholder = 'Optional note' }) {
  return (
    <div>
      <label className="block text-[11px] text-muted-foreground mb-1 font-medium">
        Note <span className="font-normal text-subtle-foreground">(optional)</span>
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors resize-none"
      />
    </div>
  );
}

export function EnrollmentDrawer({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <EnrollmentDrawerContent {...props} />;
}
