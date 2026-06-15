import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useCreateSkill, useUpdateSkill } from './useSkills';

// Create/edit a Skill (TMS.update gap #4). Roles that can carry a required
// level: the learner-facing system roles (Admin is a superuser, not a target).
const TARGET_ROLES = ['Coordinator', 'Teacher', 'Participant'];
const s = 'skills';

const inputCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-small text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function SkillFormDialog({ open, onOpenChange, skill }) {
  const { t } = useTranslation();
  const isEdit = Boolean(skill);
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const programsQuery = useLearningPrograms();
  const programs = useMemo(() => {
    const d = programsQuery.data;
    return Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
  }, [programsQuery.data]);

  const [form, setForm] = useState(() => ({
    name: skill?.name ?? '',
    category: skill?.category ?? 'General',
    maxLevel: skill?.maxLevel ?? 5,
    coverageTarget: skill?.coverageTarget ?? '',
    programIds: skill?.programIds ?? [],
    targetByRole: { ...(skill?.targetByRole ?? {}) },
  }));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleProgram = (id) =>
    set({ programIds: form.programIds.includes(id) ? form.programIds.filter((p) => p !== id) : [...form.programIds, id] });
  const setRoleTarget = (role, val) => {
    const n = Math.max(0, Math.min(10, parseInt(val, 10) || 0));
    set({ targetByRole: { ...form.targetByRole, [role]: n } });
  };

  const submit = async (e) => {
    e.preventDefault();
    // Drop 0/empty role targets so they don't register as "required".
    const targetByRole = Object.fromEntries(
      Object.entries(form.targetByRole).filter(([, v]) => Number(v) > 0),
    );
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || 'General',
      maxLevel: Number(form.maxLevel) || 5,
      coverageTarget: form.coverageTarget === '' ? null : Number(form.coverageTarget),
      programIds: form.programIds,
      targetByRole,
    };
    try {
      if (isEdit) await updateSkill.mutateAsync({ id: skill._id, ...payload });
      else await createSkill.mutateAsync(payload);
      toast.success(t(`${s}.saved`));
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.message || t(`${s}.saveError`));
    }
  };

  const pending = createSkill.isPending || updateSkill.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? t(`${s}.editSkill`) : t(`${s}.newSkill`)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field id="skill-name" label={t(`${s}.form.name`)}>
            <input id="skill-name" className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="skill-category" label={t(`${s}.form.category`)}>
              <input id="skill-category" className={inputCls} value={form.category} onChange={(e) => set({ category: e.target.value })} />
            </Field>
            <Field id="skill-max" label={t(`${s}.form.maxLevel`)}>
              <input id="skill-max" type="number" min="1" max="10" className={inputCls} value={form.maxLevel} onChange={(e) => set({ maxLevel: e.target.value })} />
            </Field>
          </div>
          <Field id="skill-coverage" label={t(`${s}.form.coverageTarget`)}>
            <input id="skill-coverage" type="number" min="1" className={inputCls} value={form.coverageTarget} placeholder={t(`${s}.form.coverageHint`)} onChange={(e) => set({ coverageTarget: e.target.value })} />
          </Field>

          <div>
            <span className="mb-1 block text-small text-muted-foreground">{t(`${s}.form.programs`)}</span>
            <div className="max-h-36 overflow-y-auto rounded-md border border-border p-2">
              {programs.length ? programs.map((p) => (
                <label key={p._id || p.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={form.programIds.includes(p._id || p.id)} onChange={() => toggleProgram(p._id || p.id)} />
                  <span className="truncate">{p.name}</span>
                </label>
              )) : <p className="py-1 text-xs text-muted-foreground">{t(`${s}.form.noPrograms`)}</p>}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-small text-muted-foreground">{t(`${s}.form.targets`)}</span>
            <div className="grid grid-cols-3 gap-2">
              {TARGET_ROLES.map((role) => (
                <Field key={role} id={`skill-target-${role}`} label={role}>
                  <input id={`skill-target-${role}`} type="number" min="0" max="10" className={inputCls}
                    value={form.targetByRole[role] ?? 0} onChange={(e) => setRoleTarget(role, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {pending ? t(`${s}.form.saving`) : t(`${s}.form.save`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
