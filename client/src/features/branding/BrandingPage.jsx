import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Award, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useBranding, useUpdateBranding } from './useBranding';

const b = 'branding';
const SWATCHES = ['#3b6fe0', '#7a5ae0', '#1f9a8a', '#1f8a5b', '#d9892b', '#d6455d'];
const inputCls = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm';

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-small font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function BrandingPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useBranding();
  const updateBranding = useUpdateBranding();
  // Edits overlay the saved config (derived each render → no hydration effect).
  const [edits, setEdits] = useState({});
  const form = data ? {
    orgName: '', accentColor: SWATCHES[0], logoUrl: '', certificateTitle: '', emailSignature: '',
    ...data, ...edits,
  } : null;

  const set = (patch) => setEdits((e) => ({ ...e, ...patch }));

  const save = async () => {
    try {
      const { orgName, accentColor, logoUrl, certificateTitle, emailSignature } = form;
      await updateBranding.mutateAsync({ orgName, accentColor, logoUrl, certificateTitle, emailSignature });
      toast.success(t(`${b}.saved`));
    } catch (e) {
      toast.error(e.response?.data?.message || t(`${b}.saveError`));
    }
  };

  if (isLoading || !form) {
    return <div className="space-y-4"><div className="h-40 animate-pulse rounded-xl bg-muted" data-testid="branding-skeleton" /></div>;
  }
  if (isError) return <EmptyState title={t(`${b}.loadError`)} />;

  const initial = (form.orgName || 'T').charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(`${b}.title`)}
        description={t(`${b}.subtitle`)}
        actions={
          <Button size="sm" onClick={save} disabled={updateBranding.isPending}>
            <Check className="mr-1.5 size-4" aria-hidden="true" />{updateBranding.isPending ? t(`${b}.saving`) : t(`${b}.save`)}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Identity form */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${b}.identity`)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field id="brand-org" label={t(`${b}.orgName`)}>
              <input id="brand-org" className={inputCls} value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} />
            </Field>
            <div>
              <span className="mb-1.5 block text-small font-medium text-muted-foreground">{t(`${b}.accent`)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => set({ accentColor: c })}
                    className={cn('size-8 rounded-lg border-2', form.accentColor === c ? 'border-foreground' : 'border-transparent')}
                    style={{ background: c }} />
                ))}
                <input type="color" aria-label={t(`${b}.accent`)} value={form.accentColor} onChange={(e) => set({ accentColor: e.target.value })}
                  className="size-8 cursor-pointer rounded-lg border border-input bg-transparent p-0" />
              </div>
            </div>
            <Field id="brand-logo" label={t(`${b}.logo`)}>
              <input id="brand-logo" className={inputCls} placeholder={t(`${b}.logoHint`)} value={form.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} />
            </Field>
            <Field id="brand-cert-title" label={t(`${b}.certTitle`)}>
              <input id="brand-cert-title" className={inputCls} value={form.certificateTitle} onChange={(e) => set({ certificateTitle: e.target.value })} />
            </Field>
            <Field id="brand-sign" label={t(`${b}.emailSignature`)}>
              <input id="brand-sign" className={inputCls} placeholder={t(`${b}.emailSignatureHint`, { org: form.orgName || 'TMS' })} value={form.emailSignature} onChange={(e) => set({ emailSignature: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        {/* Live certificate preview */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">{t(`${b}.preview`)}</p>
          <div className="rounded-2xl p-1" style={{ background: `linear-gradient(135deg, ${form.accentColor}, color-mix(in oklab, ${form.accentColor} 60%, #000))` }}>
            <div className="relative overflow-hidden rounded-xl bg-card px-9 py-8 text-center">
              <div className="pointer-events-none absolute inset-2.5 rounded-lg" style={{ border: `1px solid color-mix(in oklab, ${form.accentColor} 40%, transparent)` }} />
              <div className="mb-4 flex items-center justify-center gap-2">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="" className="size-7 rounded-md object-contain" />
                  : <span className="grid size-7 place-items-center rounded-md text-sm font-bold text-white" style={{ background: form.accentColor }}>{initial}</span>}
                <span className="text-sm font-semibold tracking-tight">{form.orgName || 'TMS'}</span>
              </div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: form.accentColor }}>{form.certificateTitle || t(`${b}.defaultCertTitle`)}</div>
              <div className="text-xs text-subtle-foreground">{t(`${b}.previewThis`)}</div>
              <div className="my-1 text-2xl font-bold tracking-tight">Khoa Pham</div>
              <div className="text-xs text-muted-foreground">{t(`${b}.previewCompleted`)} <b className="text-foreground">Leadership Essentials</b></div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <div className="text-left"><div className="text-[10px] text-subtle-foreground">{t(`${b}.previewIssued`)}</div><div className="font-mono text-[11px] font-semibold">14 Jun 2026</div></div>
                <span className="grid size-10 place-items-center rounded-full" style={{ border: `2px solid ${form.accentColor}`, color: form.accentColor }}><Award className="size-5" aria-hidden="true" /></span>
                <div className="text-right"><div className="text-[10px] text-subtle-foreground">{t(`${b}.previewVerify`)}</div><div className="font-mono text-[11px] font-semibold">tms.id/v/8KQ2</div></div>
              </div>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-subtle-foreground"><Info className="size-3" aria-hidden="true" />{t(`${b}.previewNote`)}</p>
        </div>
      </div>
    </div>
  );
}
