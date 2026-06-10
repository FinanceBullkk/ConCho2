import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { useRole } from '../../hooks/useRole';
import { useOffices, useCreateOffice, useArchiveOffice } from '../../hooks/useOrg';

// ──────────────────────────────────────────────────────────
// OfficesPage — People → Offices tab (re-center Phase 1).
// Physical sites (2–3 offices); employees and (Phase 3) Rooms
// belong to an Office. Admin/Coordinator-managed.
// ──────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

const EMPTY_FORM = { name: '', code: '', address: '', timezone: '' };

function CreateOfficeForm() {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const create = useCreateOffice();

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    create.mutate(form, { onSuccess: () => setForm(EMPTY_FORM) });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          aria-label={t('org.offices.name')}
          className={INPUT_CLS}
          placeholder={t('org.offices.namePlaceholder')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          aria-label={t('org.offices.code')}
          className={INPUT_CLS}
          placeholder={t('org.offices.codePlaceholder')}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <input
          aria-label={t('org.offices.address')}
          className={INPUT_CLS}
          placeholder={t('org.offices.addressPlaceholder')}
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <input
          aria-label={t('org.offices.timezone')}
          className={INPUT_CLS}
          placeholder={t('org.offices.timezonePlaceholder')}
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={create.isPending || !form.name.trim() || !form.code.trim()} className="self-start">
        {create.isPending ? <Spinner size={16} /> : t('org.offices.add')}
      </Button>
    </form>
  );
}

export default function OfficesPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const { data: offices, isLoading } = useOffices();
  const archive = useArchiveOffice();
  const canManage = can('manage:office');

  return (
    <div className="space-y-4">
      {canManage && <CreateOfficeForm />}

      {isLoading ? (
        <div className="bg-card border border-border rounded-lg py-16 flex items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : !offices?.length ? (
        <div className="bg-card border border-border rounded-lg py-12 text-center text-subtle-foreground text-sm">
          {t('org.offices.empty')}{canManage ? t('org.offices.emptyAdmin') : ''}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">{t('org.offices.colOffice')}</th>
                <th className="px-4 py-3 font-medium">{t('org.offices.colCode')}</th>
                <th className="px-4 py-3 font-medium">{t('org.offices.colAddress')}</th>
                <th className="px-4 py-3 font-medium">{t('org.offices.colTimezone')}</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">{t('org.offices.colActions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {offices.map((o) => (
                <tr key={o._id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                      {o.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.address || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.timezone || '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('org.offices.archiveLabel', { name: o.name })}
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(t('org.offices.archiveConfirm', { name: o.name }))) archive.mutate(o._id);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
