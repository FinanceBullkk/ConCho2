import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Sparkles, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useSkills, useRoleProfiles, useDeleteSkill } from './useSkills';
import SkillFormDialog from './SkillFormDialog';

const s = 'skills';
const barTone = (pct) => (pct >= 80 ? 'bg-success' : pct >= 55 ? 'bg-primary' : 'bg-warning');

export default function SkillsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useSkills();
  const { data: roleProfiles = [] } = useRoleProfiles();
  const deleteSkill = useDeleteSkill();

  const skills = useMemo(() => data?.skills ?? [], [data]);
  const categories = data?.categories ?? [];
  const [cat, setCat] = useState('All');
  const [dialog, setDialog] = useState(null); // { skill? } | null

  const shown = cat === 'All' ? skills : skills.filter((sk) => sk.category === cat);

  const doDelete = async (skill) => {
    try { await deleteSkill.mutateAsync(skill._id); toast.success(t(`${s}.deleted`)); }
    catch (e) { toast.error(e.response?.data?.message || t(`${s}.saveError`)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(`${s}.title`)}
        description={t(`${s}.subtitle`)}
        actions={
          <Button size="sm" onClick={() => setDialog({})}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />{t(`${s}.newSkill`)}
          </Button>
        }
      />

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" data-testid="skills-skeleton" />}
      {isError && !isLoading && <EmptyState title={t(`${s}.loadError`)} />}

      {!isLoading && !isError && (
        <>
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {['All', ...categories].map((c) => (
                <button key={c} type="button" onClick={() => setCat(c)}
                  className={cn('rounded-full border px-3 py-1 text-xs', cat === c ? 'border-primary bg-primary-tint text-primary' : 'border-border text-muted-foreground')}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Skills grid */}
          {shown.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((sk) => (
                <Card key={sk._id}>
                  <CardContent className="pt-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="grid size-8 place-items-center rounded-lg bg-primary-tint text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{sk.category}</Badge>
                        <button type="button" aria-label={`${t(`${s}.edit`)} ${sk.name}`} onClick={() => setDialog({ skill: sk })} className="text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                        <button type="button" aria-label={`${t(`${s}.delete`)} ${sk.name}`} onClick={() => doDelete(sk)} className="text-destructive hover:opacity-70"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{sk.name}</p>
                    <p className="mb-3 text-[11px] text-subtle-foreground">{t(`${s}.buildsCount`, { count: sk.programCount })}</p>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{t(`${s}.coverage`)}</span>
                      <span className="font-mono font-semibold text-foreground">
                        {sk.holders}{sk.coverageTarget ? <span className="text-subtle-foreground"> / {sk.coverageTarget}</span> : null}
                      </span>
                    </div>
                    {sk.coverageTarget ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className={cn('block h-full rounded-full', barTone(sk.coveragePct ?? 0))} style={{ width: `${Math.min(100, sk.coveragePct ?? 0)}%` }} />
                      </div>
                    ) : <p className="text-[11px] text-subtle-foreground">{t(`${s}.holdersOnly`, { count: sk.holders })}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState title={t(`${s}.empty`)} />}

          {/* Role skill profiles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t(`${s}.roleProfiles`)}</CardTitle>
              <p className="text-xs text-muted-foreground">{t(`${s}.roleProfilesHint`)}</p>
            </CardHeader>
            <CardContent>
              {roleProfiles.length ? (
                <ul className="divide-y divide-border">
                  {roleProfiles.map((r) => (
                    <li key={r.role} className="py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{r.role}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                            <span className={cn('block h-full rounded-full', barTone(r.coverage))} style={{ width: `${r.coverage}%` }} />
                          </div>
                          <span className="w-9 font-mono text-xs font-semibold tabular-nums">{r.coverage}%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.skills.map((sk) => <Badge key={sk.name} variant="outline">{sk.name} · {sk.target}</Badge>)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t(`${s}.noRoleProfiles`)}</p>}
            </CardContent>
          </Card>
        </>
      )}

      {dialog && <SkillFormDialog open onOpenChange={(o) => !o && setDialog(null)} skill={dialog.skill} />}
    </div>
  );
}
