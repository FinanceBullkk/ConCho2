import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Zap, Filter, CheckCircle2, Trash2, Bell, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useAutomationRules, useCreateRule, useUpdateRule, useDeleteRule } from './useAutomation';

const a = 'automation';
const ACTION_ICON = { notify: Bell, log: FileText };
const titleize = (s) => (s || '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function AutomationPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAutomationRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  const rules = useMemo(() => data?.rules ?? [], [data]);
  const triggers = data?.triggers ?? [];
  const actionTypes = data?.actionTypes ?? [];

  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // new-rule form

  const selected = rules.find((r) => r._id === selectedId) ?? rules[0] ?? null;
  const activeCount = rules.filter((r) => r.enabled).length;

  const toggle = async (rule) => {
    try { await updateRule.mutateAsync({ id: rule._id, enabled: !rule.enabled }); }
    catch (e) { toast.error(e.response?.data?.message || t(`${a}.saveError`)); }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      const action = { type: draft.actionType, params: draft.actionType === 'notify' ? { message: draft.message } : {} };
      await createRule.mutateAsync({ name: draft.name.trim(), trigger: draft.trigger, actions: [action] });
      toast.success(t(`${a}.saved`));
      setDraft(null);
    } catch (e2) {
      toast.error(e2.response?.data?.message || t(`${a}.saveError`));
    }
  };

  const doDelete = async (rule) => {
    try { await deleteRule.mutateAsync(rule._id); toast.success(t(`${a}.deleted`)); }
    catch (e) { toast.error(e.response?.data?.message || t(`${a}.saveError`)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(`${a}.title`)}
        description={t(`${a}.subtitle`)}
        actions={
          <Button size="sm" onClick={() => setDraft({ name: '', trigger: triggers[0] || '', actionType: 'notify', message: '' })}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />{t(`${a}.newRule`)}
          </Button>
        }
      />

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" data-testid="automation-skeleton" />}
      {isError && !isLoading && <EmptyState title={t(`${a}.loadError`)} />}

      {!isLoading && !isError && data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Rules list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t(`${a}.rules`)} <span className="text-subtle-foreground">· {t(`${a}.active`, { count: activeCount })}</span></CardTitle>
            </CardHeader>
            <CardContent>
              {rules.length ? (
                <ul className="divide-y divide-border">
                  {rules.map((rule) => (
                    <li key={rule._id}>
                      <div className={cn('flex items-center gap-3 py-2.5', selected?._id === rule._id && 'rounded-md bg-accent/40')}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setSelectedId(rule._id)}>
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-tint text-primary"><Zap className="size-4" aria-hidden="true" /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{rule.name}</span>
                            <span className="block truncate text-[11px] text-subtle-foreground">{t(`${a}.runs`, { count: rule.runCount || 0 })}{rule.system && ` · ${t(`${a}.systemBadge`)}`}</span>
                          </span>
                        </button>
                        {!rule.system && (
                          <button type="button" aria-label={`${t(`${a}.deleteRule`)} ${rule.name}`} onClick={() => doDelete(rule)} className="text-destructive hover:opacity-70">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                        <input type="checkbox" className="size-4 accent-primary" aria-label={rule.name} checked={Boolean(rule.enabled)} onChange={() => toggle(rule)} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title={t(`${a}.empty`)} />}
            </CardContent>
          </Card>

          {/* Selected rule: when → if → then */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{selected ? selected.name : t(`${a}.then`)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selected ? (
                <>
                  <Stage icon={Zap} label={t(`${a}.when`)} tone="primary"><span className="font-mono text-xs">{selected.trigger}</span></Stage>
                  <Stage icon={Filter} label={t(`${a}.if`)} tone="warning">
                    {selected.conditions?.length
                      ? selected.conditions.map((c, i) => <span key={i} className="font-mono text-xs">{c.field} {c.op} {String(c.value)}</span>)
                      : <span className="text-xs text-muted-foreground">{t(`${a}.noConditions`)}</span>}
                  </Stage>
                  <Stage icon={CheckCircle2} label={t(`${a}.then`)} tone="success">
                    <div className="flex flex-wrap gap-1.5">
                      {selected.actions?.map((act, i) => {
                        const Icon = ACTION_ICON[act.type] || FileText;
                        return <Badge key={i} variant="secondary"><Icon className="mr-1 size-3" aria-hidden="true" />{t(`${a}.action.${act.type}`, act.type)}</Badge>;
                      })}
                    </div>
                  </Stage>
                </>
              ) : <p className="text-sm text-muted-foreground">{t(`${a}.selectHint`)}</p>}
            </CardContent>
          </Card>

          {/* Libraries */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${a}.triggerLibrary`)}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {triggers.map((tr) => <Badge key={tr} variant="outline"><Zap className="mr-1 size-3" aria-hidden="true" />{titleize(tr)}</Badge>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${a}.actionLibrary`)}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {actionTypes.map((ty) => {
                const Icon = ACTION_ICON[ty] || FileText;
                return <Badge key={ty} variant="outline"><Icon className="mr-1 size-3" aria-hidden="true" />{t(`${a}.action.${ty}`, ty)}</Badge>;
              })}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(`${a}.newRule`)}</DialogTitle></DialogHeader>
          {draft && (
            <form onSubmit={create} className="space-y-3">
              <Field id="auto-name" label={t(`${a}.form.name`)}>
                <input id="auto-name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required />
              </Field>
              <Field id="auto-trigger" label={t(`${a}.form.trigger`)}>
                <select id="auto-trigger" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.trigger} onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))}>
                  {triggers.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
                </select>
              </Field>
              <Field id="auto-action" label={t(`${a}.form.actionType`)}>
                <select id="auto-action" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.actionType} onChange={(e) => setDraft((d) => ({ ...d, actionType: e.target.value }))}>
                  {actionTypes.map((ty) => <option key={ty} value={ty}>{t(`${a}.action.${ty}`, ty)}</option>)}
                </select>
              </Field>
              {draft.actionType === 'notify' && (
                <Field id="auto-message" label={t(`${a}.form.message`)}>
                  <input id="auto-message" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.message} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} />
                </Field>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel', 'Cancel')}</Button>
                <Button type="submit" disabled={createRule.isPending || !draft.name.trim() || !draft.trigger}>
                  {createRule.isPending ? t(`${a}.form.creating`) : t(`${a}.form.create`)}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stage({ icon, label, tone, children }) {
  const Icon = icon;
  const tints = { primary: 'bg-primary-tint text-primary', warning: 'bg-warning-tint text-warning', success: 'bg-success-tint text-success' };
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn('grid size-6 place-items-center rounded-md', tints[tone])}><Icon className="size-3.5" aria-hidden="true" /></span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">{label}</span>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-small text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
