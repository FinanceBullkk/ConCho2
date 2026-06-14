import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import {
  useMyNotifications, useMarkAllNotificationsRead,
  useNotificationPreferences, useSetNotificationPreferences,
} from './useNotifications';

// ──────────────────────────────────────────────────────────
// NotificationsPage — full inbox + delivery preferences (TMS.update S7).
// Feed reuses the bell's self-scoped read; preferences use the new
// per-category in-app/email + digest endpoints. Categories are derived from
// the NotificationLog `type` already on each feed item.
// ──────────────────────────────────────────────────────────
const n = 'notificationsPage';
const CATEGORIES = ['overdue', 'certificates', 'completions', 'assignments', 'system'];

// NotificationLog type → feed category.
const TYPE_CATEGORY = {
  assignment_overdue: 'overdue',
  manager_assignment_digest: 'overdue',
  coordinator_nudge: 'overdue',
  certificate_expiring: 'certificates',
  manager_certificate_expiry_digest: 'certificates',
  certificate_issued: 'completions',
  assignment_due_soon: 'assignments',
  cohort_enrolled: 'assignments',
  waitlist_promoted: 'system',
  booking_confirmed: 'system',
  session_enrolled: 'system',
};
const catOf = (type) => TYPE_CATEGORY[type] || 'system';

function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PrefRow({ cat, value, onToggle }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-foreground">{t(`${n}.cat.${cat}`)}</span>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={Boolean(value?.inApp)} onChange={() => onToggle(cat, 'inApp')} aria-label={`${t(`${n}.cat.${cat}`)} ${t(`${n}.prefs.inApp`)}`} />
          {t(`${n}.prefs.inApp`)}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={Boolean(value?.email)} onChange={() => onToggle(cat, 'email')} aria-label={`${t(`${n}.cat.${cat}`)} ${t(`${n}.prefs.email`)}`} />
          {t(`${n}.prefs.email`)}
        </label>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');

  const { data } = useMyNotifications();
  const markAll = useMarkAllNotificationsRead();
  const { data: prefs } = useNotificationPreferences();
  const setPrefs = useSetNotificationPreferences();

  const items = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;
  const filtered = filter === 'all' ? items : items.filter((it) => catOf(it.type) === filter);

  const togglePref = (cat, channel) => {
    const current = prefs?.categories?.[cat] || { inApp: false, email: false };
    setPrefs.mutate(
      { categories: { [cat]: { ...current, [channel]: !current[channel] } } },
      { onError: () => toast.error(t(`${n}.prefs.saveError`)) },
    );
  };
  const setDigest = (digest) => setPrefs.mutate({ digest }, { onError: () => toast.error(t(`${n}.prefs.saveError`)) });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(`${n}.title`)}
        description={t(`${n}.subtitle`)}
        actions={unread > 0 ? (
          <Button size="sm" variant="outline" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-1.5 size-4" aria-hidden="true" />{t(`${n}.markAllRead`)}
          </Button>
        ) : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {['all', ...CATEGORIES].map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
                {t(`${n}.filters.${f}`)}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-4">
              {filtered.length ? (
                <ul className="divide-y divide-border">
                  {filtered.map((it) => (
                    <li key={it.id} className="flex items-start gap-3 py-2.5">
                      {!it.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', it.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{it.title}</p>
                        {it.body && <p className="truncate text-xs text-subtle-foreground">{it.body}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(it.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title={t(`${n}.empty`)} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t(`${n}.prefs.title`)}</CardTitle>
              <p className="text-xs text-muted-foreground">{t(`${n}.prefs.subtitle`)}</p>
            </CardHeader>
            <CardContent>
              {CATEGORIES.map((cat) => (
                <PrefRow key={cat} cat={cat} value={prefs?.categories?.[cat]} onToggle={togglePref} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t(`${n}.prefs.digestTitle`)}</CardTitle>
              <p className="text-xs text-muted-foreground">{t(`${n}.prefs.digestSubtitle`)}</p>
            </CardHeader>
            <CardContent>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {['daily', 'weekly', 'off'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDigest(d)}
                    className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', prefs?.digest === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {t(`${n}.prefs.digest.${d}`)}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
