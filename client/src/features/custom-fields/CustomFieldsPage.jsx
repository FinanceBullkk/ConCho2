import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Info } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CustomFieldInput } from './custom-field-input';
import { useCustomFields, useCreateCustomField, useDeleteCustomField } from './useCustomFields';

const ENTITY = 'Program';
const ctrl = 'w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

// Label → snake_case key; guarantee it starts with a letter (server regex).
const slugify = (s) => {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[a-z]/.test(base) ? base : `f_${base}`.slice(0, 40);
};

const TYPES = ['text', 'number', 'select', 'multiselect', 'date', 'toggle', 'user'];
const TYPE_LABEL = { text: 'typeText', number: 'typeNumber', select: 'typeSelect', multiselect: 'typeMultiselect', date: 'typeDate', toggle: 'typeToggle', user: 'typeUser' };
const SURFACES = ['form', 'filter', 'export'];
const SURFACE_LABEL = { form: 'showInForm', filter: 'showInFilter', export: 'showInExport' };
const needsOptions = (type) => type === 'select' || type === 'multiselect';

const blankForm = { label: '', key: '', keyTouched: false, type: 'text', optionsText: '', required: false, showIn: ['form'] };

export default function CustomFieldsPage() {
  const { t } = useTranslation();
  const { data: fields = [], isLoading, isError } = useCustomFields({ entity: ENTITY });
  const createMutation = useCreateCustomField();
  const deleteMutation = useDeleteCustomField();

  const [form, setForm] = useState(blankForm);
  const [preview, setPreview] = useState({});

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const onLabel = (v) => setForm((f) => ({ ...f, label: v, key: f.keyTouched ? f.key : slugify(v) }));

  const options = useMemo(
    () => form.optionsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    [form.optionsText],
  );
  const canAdd = form.label.trim() && form.key.trim() && (!needsOptions(form.type) || options.length > 0);
  const toggleSurface = (s) => setForm((f) => ({
    ...f,
    showIn: f.showIn.includes(s) ? f.showIn.filter((x) => x !== s) : [...f.showIn, s],
  }));

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        entity: ENTITY,
        key: form.key.trim(),
        label: form.label.trim(),
        type: form.type,
        options: needsOptions(form.type) ? options : [],
        showIn: form.showIn.length ? form.showIn : ['form'],
        required: form.required,
        order: fields.length,
      });
      toast.success(t('customFields.added'));
      setForm(blankForm);
    } catch (err) {
      toast.error(err.response?.data?.message || t('customFields.saveFailed'));
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success(t('customFields.removed'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('customFields.saveFailed'));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('customFields.title')} description={t('customFields.description')} />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t('customFields.note')}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Manager: existing fields + add form */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {t('customFields.programFields')} <span className="text-subtle-foreground">· {fields.length}</span>
            </div>
            {isLoading && <div className="space-y-2 p-4" data-testid="cf-skeleton">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />)}</div>}
            {isError && !isLoading && <div className="p-4"><EmptyState title={t('customFields.loadError')} description={t('customFields.loadErrorDesc')} /></div>}
            {!isLoading && !isError && fields.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-subtle-foreground">{t('customFields.empty')}</p>
            )}
            {!isLoading && !isError && fields.length > 0 && (
              <ul className="divide-y divide-border">
                {fields.map((f) => (
                  <li key={f._id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{f.label}</span>
                        {f.required && <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-[10px] font-semibold text-warning">{t('customFields.required')}</span>}
                      </div>
                      <span className="font-mono text-[11px] text-subtle-foreground">{f.key} · {f.type}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" aria-label={`${t('customFields.remove')} ${f.label}`}
                      onClick={() => handleDelete(f._id)} disabled={deleteMutation.isPending}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">{t('customFields.addField')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cf-label" className="mb-1 block text-small text-muted-foreground">{t('customFields.label')}</label>
                <input id="cf-label" className={ctrl} value={form.label} onChange={(e) => onLabel(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="cf-key" className="mb-1 block text-small text-muted-foreground">{t('customFields.key')}</label>
                <input id="cf-key" className={cn(ctrl, 'font-mono')} value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value, keyTouched: true }))} required />
              </div>
              <div>
                <label htmlFor="cf-type" className="mb-1 block text-small text-muted-foreground">{t('customFields.type')}</label>
                <select id="cf-type" className={ctrl} value={form.type} onChange={(e) => set('type')(e.target.value)}>
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty} className="bg-popover">{t(`customFields.${TYPE_LABEL[ty]}`)}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                <input type="checkbox" checked={form.required} onChange={(e) => set('required')(e.target.checked)} />
                {t('customFields.requiredField')}
              </label>
            </div>
            {needsOptions(form.type) && (
              <div>
                <label htmlFor="cf-options" className="mb-1 block text-small text-muted-foreground">{t('customFields.options')}</label>
                <input id="cf-options" className={ctrl} value={form.optionsText} onChange={(e) => set('optionsText')(e.target.value)}
                  placeholder={t('customFields.optionsHint')} />
              </div>
            )}
            <div>
              <span className="mb-1 block text-small text-muted-foreground">{t('customFields.showIn')}</span>
              <div className="flex flex-wrap gap-3">
                {SURFACES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm text-foreground">
                    <input type="checkbox" className="size-4 accent-primary" checked={form.showIn.includes(s)} onChange={() => toggleSurface(s)} />
                    {t(`customFields.${SURFACE_LABEL[s]}`)}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" size="sm" disabled={!canAdd || createMutation.isPending}>
              <Plus className="size-4" />{t('customFields.add')}
            </Button>
          </form>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">{t('customFields.preview')}</div>
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            {fields.length === 0 ? (
              <p className="text-sm text-subtle-foreground">{t('customFields.previewEmpty')}</p>
            ) : (
              fields.map((f) => (
                <CustomFieldInput key={f._id} def={f} value={preview[f.key]}
                  onChange={(v) => setPreview((p) => ({ ...p, [f.key]: v }))} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
