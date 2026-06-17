import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { useVendor, useVendorSpend, useUpdateVendor, useRateVendor } from './useVendors';
import { RenewalBadge, Stars } from './vendor-ui';
import { fmtMinor, fmtDate } from './vendor-format';

// ──────────────────────────────────────────────────────────
// VendorDetailPanel — A2 expanded row: contracts (+ add), ratings (+ add),
// per-vendor spend (FY), and the delivered-programs list. Edits go through the
// vendor.manage-gated mutations. Contracts are PUT as a whole array, so existing
// rows are re-sent stripped to schema-allowed fields (the zod contract is strict).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

// Strip a stored contract to only the schema-allowed keys (drops _id etc.).
const cleanContract = (c) => ({
  ref: c.ref || '',
  ...(c.startsOn ? { startsOn: c.startsOn } : {}),
  ...(c.endsOn ? { endsOn: c.endsOn } : {}),
  valueMinor: Number(c.valueMinor) || 0,
  currency: (c.currency || 'USD').toUpperCase(),
  docUrl: c.docUrl || '',
});

function AddContractForm({ vendor, onDone }) {
  const { t } = useTranslation();
  const update = useUpdateVendor();
  const [form, setForm] = useState({ ref: '', endsOn: '', valueMinor: '', currency: 'USD' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.endsOn && !form.ref) return;
    const next = [...(vendor.contracts || []).map(cleanContract), {
      ref: form.ref.trim(),
      ...(form.endsOn ? { endsOn: form.endsOn } : {}),
      valueMinor: Number(form.valueMinor) || 0,
      currency: form.currency.toUpperCase(),
    }];
    update.mutate({ id: vendor._id, data: { contracts: next } }, { onSuccess: () => { setForm({ ref: '', endsOn: '', valueMinor: '', currency: 'USD' }); onDone?.(); } });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2">
      <input className={`${inputCls} w-32`} placeholder={t('vendor.contractRef')} value={form.ref} onChange={set('ref')} aria-label={t('vendor.contractRef')} />
      <input className={`${inputCls} w-40`} type="date" value={form.endsOn} onChange={set('endsOn')} aria-label={t('vendor.contractEnds')} />
      <input className={`${inputCls} w-32`} type="number" min="0" placeholder={t('vendor.valueMinor')} value={form.valueMinor} onChange={set('valueMinor')} aria-label={t('vendor.valueMinor')} />
      <input className={`${inputCls} w-20`} maxLength={3} value={form.currency} onChange={set('currency')} aria-label={t('vendor.currency')} />
      <Button size="sm" type="submit" disabled={update.isPending}><Plus className="size-3.5" aria-hidden="true" />{t('vendor.addContract')}</Button>
    </form>
  );
}

function AddRatingForm({ vendorId }) {
  const { t } = useTranslation();
  const rate = useRateVendor();
  const [value, setValue] = useState(5);
  const [note, setNote] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); rate.mutate({ id: vendorId, value: Number(value), note: note.trim() }, { onSuccess: () => setNote('') }); }}
      className="flex flex-wrap items-end gap-2 mt-2"
    >
      <select className={`${inputCls} w-20`} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('vendor.rating')}>
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <input className={`${inputCls} flex-1 min-w-40`} placeholder={t('vendor.ratingNote')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('vendor.ratingNote')} />
      <Button size="sm" variant="outline" type="submit" disabled={rate.isPending}><Star className="size-3.5" aria-hidden="true" />{t('vendor.addRating')}</Button>
    </form>
  );
}

function Block({ title, children }) {
  return (
    <div className="space-y-1">
      <h4 className="text-overline text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export default function VendorDetailPanel({ vendorId, canManage, programNameById, fiscalYear }) {
  const { t } = useTranslation();
  const { data: vendor, isLoading } = useVendor(vendorId);
  const { data: spend } = useVendorSpend(vendorId, { fiscalYear });

  if (isLoading || !vendor) return <div className="py-6 flex justify-center"><Spinner size={18} /></div>;

  const delivers = (vendor.delivers || []).map((id) => programNameById.get(String(id)) || String(id));

  return (
    <div className="grid gap-5 md:grid-cols-2 px-4 py-4 bg-muted/30">
      <Block title={t('vendor.contacts')}>
        {(vendor.contacts || []).length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
          <ul className="text-sm space-y-0.5">
            {vendor.contacts.map((c, i) => (
              <li key={i}>{c.name}{c.role ? ` · ${c.role}` : ''}{c.email ? ` · ${c.email}` : ''}</li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={t('vendor.deliversPrograms')}>
        {delivers.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
          <div className="flex flex-wrap gap-1">
            {delivers.map((name, i) => <span key={i} className="rounded bg-secondary px-2 py-0.5 text-xs">{name}</span>)}
          </div>
        )}
      </Block>

      <Block title={`${t('vendor.spend')} · FY${fiscalYear}`}>
        <p className="text-sm tabular-nums">{spend ? fmtMinor(spend.totalMinor, spend.currency) : '—'}</p>
        {spend?.byType?.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
            {spend.byType.map((b) => <li key={b.type}>{b.type}: {fmtMinor(b.totalMinor, spend.currency)}</li>)}
          </ul>
        )}
      </Block>

      <Block title={t('vendor.ratings')}>
        <Stars avg={vendor.ratingAvg} count={vendor.ratingCount} t={t} />
        {canManage && <AddRatingForm vendorId={vendorId} />}
      </Block>

      <div className="md:col-span-2">
        <Block title={t('vendor.contracts')}>
          {(vendor.contracts || []).length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="text-sm space-y-0.5">
              {vendor.contracts.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-medium">{c.ref || t('vendor.contract')}</span>
                  <span className="text-muted-foreground">{fmtMinor(c.valueMinor, c.currency)}</span>
                  {c.endsOn && <span className="text-xs text-muted-foreground">· {t('vendor.contractEnds')} {fmtDate(c.endsOn)}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1"><RenewalBadge status={vendor.renewalStatus} endsOn={vendor.latestContractEndsOn} t={t} /></div>
          {canManage && <AddContractForm vendor={vendor} />}
        </Block>
      </div>
    </div>
  );
}
