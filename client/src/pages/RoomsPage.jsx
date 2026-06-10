import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DoorOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { useRole } from '../hooks/useRole';
import { useOffices } from '../hooks/useOrg';
import { useRooms, useCreateRoom, useArchiveRoom } from '../hooks/useRooms';

// ──────────────────────────────────────────────────────────
// RoomsPage — People → Rooms tab (re-center Phase 3).
// Physical rooms, each scoped to an Office. Admin/Coordinator-managed;
// used by the coordinator session-create flow (room picker).
// ──────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

const EMPTY_FORM = { name: '', code: '', officeId: '', seats: '' };

function CreateRoomForm({ offices }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const create = useCreateRoom();

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim() || !form.officeId) return;
    const payload = { name: form.name, code: form.code, officeId: form.officeId };
    if (form.seats) payload.seats = Number(form.seats);
    create.mutate(payload, { onSuccess: () => setForm(EMPTY_FORM) });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          aria-label={t('org.rooms.name')}
          className={INPUT_CLS}
          placeholder={t('org.rooms.namePlaceholder')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          aria-label={t('org.rooms.code')}
          className={INPUT_CLS}
          placeholder={t('org.rooms.codePlaceholder')}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <select
          aria-label={t('org.rooms.office')}
          className={INPUT_CLS}
          value={form.officeId}
          onChange={(e) => setForm((f) => ({ ...f, officeId: e.target.value }))}
        >
          <option value="">{t('org.rooms.selectOffice')}</option>
          {(offices || []).map((o) => (
            <option key={o._id} value={o._id}>{o.name} ({o.code})</option>
          ))}
        </select>
        <input
          aria-label={t('org.rooms.seats')}
          className={INPUT_CLS}
          type="number"
          min="1"
          placeholder={t('org.rooms.seatsPlaceholder')}
          value={form.seats}
          onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
        />
      </div>
      <Button
        type="submit"
        disabled={create.isPending || !form.name.trim() || !form.code.trim() || !form.officeId}
        className="self-start"
      >
        {create.isPending ? <Spinner size={16} /> : t('org.rooms.add')}
      </Button>
    </form>
  );
}

export default function RoomsPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const { data: offices } = useOffices();
  const { data: rooms, isLoading } = useRooms();
  const archive = useArchiveRoom();
  const canManage = can('manage:room');

  return (
    <div className="space-y-4">
      {canManage && <CreateRoomForm offices={offices} />}

      {isLoading ? (
        <div className="bg-card border border-border rounded-lg py-16 flex items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : !rooms?.length ? (
        <div className="bg-card border border-border rounded-lg py-12 text-center text-subtle-foreground text-sm">
          {t('org.rooms.empty')}{canManage ? t('org.rooms.emptyAdmin') : ''}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">{t('org.rooms.colRoom')}</th>
                <th className="px-4 py-3 font-medium">{t('org.rooms.colCode')}</th>
                <th className="px-4 py-3 font-medium">{t('org.rooms.colOffice')}</th>
                <th className="px-4 py-3 font-medium">{t('org.rooms.colSeats')}</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">{t('org.rooms.colActions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rooms.map((r) => (
                <tr key={r._id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <DoorOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                      {r.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.office ? `${r.office.name} (${r.office.code})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.seats ?? '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('org.rooms.archiveLabel', { name: r.name })}
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(t('org.rooms.archiveConfirm', { name: r.name }))) archive.mutate(r._id);
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
