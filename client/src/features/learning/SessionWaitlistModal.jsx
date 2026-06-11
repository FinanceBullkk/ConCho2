import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { useScheduleWaitlist } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// SessionWaitlistModal — staff view of a session's waitlist (Wave E polish).
//
// Read-only: waiting rows carry their FIFO position; resolved rows
// (promoted/withdrawn/cancelled) stay listed as history — entries are never
// hard-deleted, so a scheduler can answer "who was queued when this session
// was cancelled?". Server scope: Admin/Coordinator any session; Teacher their
// classes (GET /api/schedules/:id/waitlist).
//
// Props:
//   session — session DTO (scheduleId used)
//   onClose — close handler
// ──────────────────────────────────────────────────────────

const STATUS_VARIANT = {
  waiting: 'secondary',
  promoted: 'default',
  withdrawn: 'outline',
  cancelled: 'destructive',
};

// Compact local date + time (viewer's timezone) for when the entry was created.
const formatJoined = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function SessionWaitlistModal({ session, onClose }) {
  const { t } = useTranslation();
  const { data, isLoading } = useScheduleWaitlist(session.scheduleId);
  const entries = data?.data || [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 space-y-4" aria-label={t('learning.waitlist.title')}>
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">{t('learning.waitlist.title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('learning.waitlist.desc')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : !entries.length ? (
          <p className="text-sm text-subtle-foreground">{t('learning.waitlist.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t('learning.waitlist.colLearner')}</TableHead>
                <TableHead>{t('learning.waitlist.colStatus')}</TableHead>
                <TableHead>{t('learning.waitlist.colJoined')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e._id}>
                  <TableCell className="font-mono">{e.position ?? '—'}</TableCell>
                  <TableCell>
                    {e.userId?.name || '—'}
                    {e.userId?.empCode && (
                      <span className="text-xs text-subtle-foreground ml-1.5">({e.userId.empCode})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status] || 'outline'}>
                      {t(`learning.waitlist.status.${e.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatJoined(e.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
