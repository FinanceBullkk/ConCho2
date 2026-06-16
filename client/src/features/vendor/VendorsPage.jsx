import { useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Handshake, Plus, Archive, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useVendors, useCreateVendor, useArchiveVendor } from './useVendors';
import VendorDetailPanel from './VendorDetailPanel';
import { RenewalBadge, Stars } from './vendor-ui';

// ──────────────────────────────────────────────────────────
// VendorsPage — A2 (Modernization Horizon 2)
// A managed catalog of external training providers: contacts, contracts (with a
// renewal signal), ratings, and per-vendor spend (rolled up from A1 costs).
// Read + write both need vendor.manage (Admin/Coordinator).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const TYPES = ['provider', 'individual', 'platform'];

const yearOptions = () => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1].map(String);
};

function NewVendorForm({ programs, onClose }) {
  const { t } = useTranslation();
  const create = useCreateVendor();
  const [form, setForm] = useState({ name: '', type: 'provider', contactName: '', contactEmail: '', note: '', delivers: [] });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    create.mutate({
      name: form.name.trim(),
      type: form.type,
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      ...(form.delivers.length ? { delivers: form.delivers } : {}),
      ...(form.contactName.trim()
        ? { contacts: [{ name: form.contactName.trim(), ...(form.contactEmail.trim() ? { email: form.contactEmail.trim() } : {}) }] }
        : {}),
    }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="v-name" className="text-overline text-muted-foreground">{t('vendor.name')}</label>
        <input id="v-name" className={`${inputCls} w-48`} value={form.name} onChange={set('name')} required />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="v-type" className="text-overline text-muted-foreground">{t('vendor.type')}</label>
        <select id="v-type" className={inputCls} value={form.type} onChange={set('type')}>
          {TYPES.map((ty) => <option key={ty} value={ty}>{t(`vendor.types.${ty}`)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="v-contact" className="text-overline text-muted-foreground">{t('vendor.contact')}</label>
        <input id="v-contact" className={`${inputCls} w-40`} value={form.contactName} onChange={set('contactName')} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="v-email" className="text-overline text-muted-foreground">{t('vendor.email')}</label>
        <input id="v-email" type="email" className={`${inputCls} w-48`} value={form.contactEmail} onChange={set('contactEmail')} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="v-delivers" className="text-overline text-muted-foreground">{t('vendor.deliversPrograms')}</label>
        <select
          id="v-delivers" multiple className={`${inputCls} h-20 w-56`}
          value={form.delivers}
          onChange={(e) => setForm((f) => ({ ...f, delivers: Array.from(e.target.selectedOptions, (o) => o.value) }))}
        >
          {programs.map((p) => <option key={p._id} value={p._id}>{p.name || p.code}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label htmlFor="v-note" className="text-overline text-muted-foreground">{t('vendor.note')}</label>
        <input id="v-note" className={inputCls} value={form.note} onChange={set('note')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>{t('vendor.create')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('vendor.cancel')}</Button>
      </div>
    </form>
  );
}

export default function VendorsPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('manage:vendor');

  const [filters, setFilters] = useState({ status: 'active', type: '', q: '' });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const query = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  };
  const { data: vendors = [], isLoading } = useVendors(query);
  const archive = useArchiveVendor();

  const { data: programsData } = useLearningPrograms();
  const programs = programsData?.data || [];
  const programNameById = new Map(programs.map((p) => [String(p._id), p.name || p.code]));

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t('vendor.title')} description={t('vendor.description')} />
        {canManage && (
          <Button size="sm" className="shrink-0 mt-1" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-3.5" aria-hidden="true" />{t('vendor.newVendor')}
          </Button>
        )}
      </div>

      {canManage && showForm && <NewVendorForm programs={programs} onClose={() => setShowForm(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} h-8`} value={filters.status} onChange={setF('status')} aria-label={t('vendor.status')}>
          <option value="active">{t('vendor.statusActive')}</option>
          <option value="archived">{t('vendor.statusArchived')}</option>
          <option value="">{t('vendor.statusAll')}</option>
        </select>
        <select className={`${inputCls} h-8`} value={filters.type} onChange={setF('type')} aria-label={t('vendor.type')}>
          <option value="">{t('vendor.allTypes')}</option>
          {TYPES.map((ty) => <option key={ty} value={ty}>{t(`vendor.types.${ty}`)}</option>)}
        </select>
        <input className={`${inputCls} h-8 w-48`} placeholder={t('vendor.search')} value={filters.q} onChange={setF('q')} aria-label={t('vendor.search')} />
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="v-fy" className="text-sm text-muted-foreground">{t('vendor.spendFy')}</label>
          <select id="v-fy" className={`${inputCls} h-8`} value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}>
            {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <section className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex justify-center"><Spinner size={22} /></div>
        ) : vendors.length === 0 ? (
          <EmptyState icon={Handshake} title={t('vendor.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-2 w-8" />
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('vendor.name')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('vendor.type')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('vendor.programs')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('vendor.rating')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('vendor.renewalCol')}</th>
                  <th scope="col" className="px-4 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const open = expanded === v._id;
                  return (
                    <Fragment key={v._id}>
                      <tr className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => setExpanded(open ? null : v._id)} aria-label={open ? t('vendor.collapse') : t('vendor.expand')} aria-expanded={open}>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {v.name}
                          {v.status === 'archived' && <span className="ml-2 text-xs text-muted-foreground">({t('vendor.statusArchived')})</span>}
                        </td>
                        <td className="px-4 py-2">{t(`vendor.types.${v.type}`)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{v.deliversCount}</td>
                        <td className="px-4 py-2"><Stars avg={v.ratingAvg} count={v.ratingCount} /></td>
                        <td className="px-4 py-2"><RenewalBadge status={v.renewalStatus} endsOn={v.latestContractEndsOn} t={t} /></td>
                        <td className="px-4 py-2 text-right">
                          {canManage && v.status !== 'archived' && (
                            <Button size="sm" variant="ghost" onClick={() => archive.mutate(v._id)} aria-label={t('vendor.archive')}>
                              <Archive className="size-3.5" aria-hidden="true" />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <VendorDetailPanel vendorId={v._id} canManage={canManage} programNameById={programNameById} fiscalYear={fiscalYear} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
